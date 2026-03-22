"""Standalone webcam proctoring demo using HolisticDetector.

This script runs a local webcam loop for testing the proctoring system.
For production use, use server.py instead.
"""

import os
import time
from datetime import datetime

import cv2

from modules.behavior import BehaviorAnalyzer
from modules.face_detection import FaceDetector
from modules.holistic_detector import HolisticDetector
from modules.logger import ExamLogger
from modules.object_detector import ObjectDetector

EVIDENCE_DIR = "evidence"
os.makedirs(EVIDENCE_DIR, exist_ok=True)


def get_risk_level(score):
    if score >= 70:
        return "HIGH", (0, 0, 255)
    if score >= 45:
        return "MEDIUM", (0, 255, 255)
    return "LOW", (0, 255, 0)


def main():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam")
        return

    face_detector = FaceDetector()
    holistic = HolisticDetector(static_image_mode=False)
    behavior_analyzer = BehaviorAnalyzer()
    exam_logger = ExamLogger()
    object_detector = ObjectDetector()

    prev_time = 0
    evidence_captured = False
    no_face_streak = 0
    multi_face_streak = 0

    print("Starting AI Proctoring Demo...")
    print("Press ESC to exit")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        h, w, _ = frame.shape

        curr_time = time.time()
        fps = int(1 / (curr_time - prev_time)) if prev_time != 0 else 0
        prev_time = curr_time

        # Face detection
        frame, detector_face_count = face_detector.detect_faces(frame)

        # Object detection
        detected_objects = object_detector.detect(frame)
        prohibited_object_detected = len(detected_objects) > 0

        # Initialize defaults
        gaze = "LOOKING CENTER"
        head = "HEAD STRAIGHT"
        angle = 0.0
        body_alerts = []
        hand_alerts = []
        score = int(round(behavior_analyzer.suspicion_score))

        # Run holistic analysis
        holistic_result = holistic.analyze(frame)

        if holistic_result and holistic_result.face_detected:
            gaze = holistic_result.gaze_direction
            head = holistic_result.head_direction
            angle = holistic_result.head_angle
            body_alerts = holistic_result.body_alerts
            hand_alerts = holistic_result.hand_alerts
            effective_face_count = max(detector_face_count, holistic_result.face_count)

            score = behavior_analyzer.analyze(gaze, head)

            if holistic_result.posture_suspicious:
                posture_penalty = min(15, len(body_alerts) * 5 + len(hand_alerts) * 5)
                score = min(100, score + posture_penalty)
        else:
            effective_face_count = detector_face_count
            if effective_face_count == 0:
                no_face_streak += 1
                score = int(round(behavior_analyzer.suspicion_score))
                if no_face_streak >= 3:
                    holistic.reset()
            else:
                no_face_streak = 0

        if effective_face_count > 1:
            multi_face_streak += 1
        else:
            multi_face_streak = max(0, multi_face_streak - 1)

        # Apply penalties
        if no_face_streak >= 2:
            score = max(score, min(65, 8 + no_face_streak * 8))
        if multi_face_streak > 0:
            score = max(score, min(90, 30 + multi_face_streak * 15))
        if prohibited_object_detected:
            score = max(score, 90)
        score = int(max(0, min(100, score)))

        # Determine violation type
        violation_type = None
        if prohibited_object_detected:
            violation_type = "PROHIBITED_OBJECT"
        elif multi_face_streak >= 2:
            violation_type = "MULTIPLE_FACES"
        elif no_face_streak >= 5:
            violation_type = "NO_FACE"
        elif score >= 70:
            violation_type = "HIGH_SUSPICION"

        risk_level, risk_color = get_risk_level(score)
        if violation_type is not None:
            risk_level = "HIGH"
            risk_color = (0, 0, 255)

        # Capture evidence
        if risk_level == "HIGH" and not evidence_captured:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            reason = violation_type or "SUSPICIOUS_BEHAVIOR"
            filename = os.path.join(EVIDENCE_DIR, f"evidence_{reason}_{timestamp}.jpg")
            cv2.imwrite(filename, frame)
            evidence_captured = True
        elif risk_level != "HIGH":
            evidence_captured = False

        # Log
        exam_logger.log(
            gaze, head, angle, effective_face_count,
            score, risk_level, ",".join(detected_objects),
        )

        # Draw overlay
        color_gaze = (0, 255, 0) if gaze == "LOOKING CENTER" else (0, 165, 255)
        color_head = (0, 255, 0) if head == "HEAD STRAIGHT" else (0, 165, 255)

        cv2.putText(frame, f"Gaze: {gaze}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color_gaze, 2)
        cv2.putText(frame, f"Head: {head}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color_head, 2)
        cv2.putText(frame, f"Score: {score}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, risk_color, 2)
        cv2.putText(frame, f"Risk: {risk_level}", (20, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.8, risk_color, 2)
        cv2.putText(frame, f"Faces: {effective_face_count}", (20, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

        # Body & hand alerts
        alert_y = 190
        for alert in body_alerts + hand_alerts:
            cv2.putText(frame, f"ALERT: {alert}", (20, alert_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 100, 255), 2)
            alert_y += 25

        cv2.putText(frame, f"FPS: {fps}", (20, h - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

        if violation_type:
            cv2.putText(frame, violation_type, (20, h - 60), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 255), 2)

        if prohibited_object_detected:
            cv2.putText(
                frame, f"OBJECT: {', '.join(detected_objects)}",
                (w - 360, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 255), 2,
            )

        cv2.imshow("AI Proctoring Demo", frame)
        if cv2.waitKey(1) & 0xFF == 27:
            break

    cap.release()
    cv2.destroyAllWindows()
    holistic.close()
    print("Demo ended.")


if __name__ == "__main__":
    main()
