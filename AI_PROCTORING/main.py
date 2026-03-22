import os
import time
from datetime import datetime

import cv2

from modules.behavior import BehaviorAnalyzer
from modules.eye_gaze import EyeGazeTracker
from modules.face_detection import FaceDetector
from modules.holistic_detector import HolisticDetector
from modules.head_pose import HeadPoseEstimator
from modules.logger import ExamLogger
from modules.object_detector import ObjectDetector
from modules.pretrained_gaze import GazeFusion, PretrainedGazeEstimator

EVIDENCE_DIR = "evidence"
os.makedirs(EVIDENCE_DIR, exist_ok=True)


def get_risk_level(score):
    if score >= 70:
        return "HIGH", (0, 0, 255)
    if score >= 45:
        return "MEDIUM", (0, 255, 255)
    return "LOW", (0, 255, 0)


cap = cv2.VideoCapture(0)
face_detector = FaceDetector()

# Primary: Holistic detector (face + pose + hands in one pass)
holistic = HolisticDetector(static_image_mode=False)

# Fallback: Separate modules
gaze_tracker = EyeGazeTracker()
pretrained_gaze = PretrainedGazeEstimator(
    provider=os.getenv("GAZE_MODEL_PROVIDER", "auto")
)
gaze_fusion = GazeFusion(
    min_confidence=float(os.getenv("GAZE_MODEL_MIN_CONF", "0.62")),
    window_size=int(os.getenv("GAZE_MODEL_WINDOW", "5")),
    stable_count=int(os.getenv("GAZE_MODEL_STABLE_COUNT", "3")),
)
head_pose = HeadPoseEstimator()
behavior_analyzer = BehaviorAnalyzer()
exam_logger = ExamLogger()
object_detector = ObjectDetector()

prev_time = 0
evidence_captured = False
no_face_streak = 0
multi_face_streak = 0
holistic_failures = 0
USE_HOLISTIC = True

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape

    curr_time = time.time()
    fps = int(1 / (curr_time - prev_time)) if prev_time != 0 else 0
    prev_time = curr_time

    frame, detector_face_count = face_detector.detect_faces(frame)

    detected_objects = object_detector.detect(frame)
    prohibited_object_detected = len(detected_objects) > 0

    gaze = "LOOKING CENTER"
    gaze_source = "none"
    gaze_confidence = 0.0
    head = "HEAD STRAIGHT"
    angle = 0.0
    analysis_engine = "none"
    body_alerts = []
    hand_alerts = []
    score = int(round(behavior_analyzer.suspicion_score))

    # Try holistic first
    holistic_result = None
    if USE_HOLISTIC:
        try:
            holistic_result = holistic.analyze(frame)
        except Exception as err:
            holistic_failures += 1
            if holistic_failures >= 5:
                USE_HOLISTIC = False
                print(f"Holistic disabled: {err}")

    if holistic_result and holistic_result.face_detected:
        analysis_engine = "holistic"
        gaze = holistic_result.gaze_direction
        gaze_source = "holistic"
        gaze_confidence = 0.75
        head = holistic_result.head_direction
        angle = holistic_result.head_angle
        body_alerts = holistic_result.body_alerts
        hand_alerts = holistic_result.hand_alerts
        effective_face_count = max(detector_face_count, holistic_result.face_count)

        # Enhance with pretrained gaze if available
        head_pitch = holistic_result.head_pitch
        model_gaze, model_conf, _ = pretrained_gaze.predict(frame, head_pitch=head_pitch)
        if model_gaze and model_conf >= 0.62:
            gaze = model_gaze
            gaze_source = "holistic+l2cs"
            gaze_confidence = model_conf

        score = behavior_analyzer.analyze(gaze, head)

        if holistic_result.posture_suspicious:
            posture_penalty = min(15, len(body_alerts) * 5 + len(hand_alerts) * 5)
            score = min(100, score + posture_penalty)
    else:
        # Fallback: use detector face count
        effective_face_count = detector_face_count
        if effective_face_count == 0:
            no_face_streak += 1
            score = behavior_analyzer.reduce_penalty(1.0)
            if no_face_streak >= 3:
                gaze_fusion.reset()
                holistic.reset()
        else:
            no_face_streak = 0

    if effective_face_count > 1:
        multi_face_streak += 1
    else:
        multi_face_streak = max(0, multi_face_streak - 1)

    if no_face_streak >= 2:
        score = max(score, min(65, 8 + no_face_streak * 8))
    if multi_face_streak > 0:
        score = max(score, min(90, 30 + multi_face_streak * 15))
    if prohibited_object_detected:
        score = max(score, 90)
    score = int(max(0, min(100, score)))

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

    if risk_level == "HIGH" and not evidence_captured:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        reason = violation_type or "SUSPICIOUS_BEHAVIOR"
        filename = os.path.join(EVIDENCE_DIR, f"evidence_{reason}_{timestamp}.jpg")
        cv2.imwrite(filename, frame)
        evidence_captured = True
    elif risk_level != "HIGH":
        evidence_captured = False

    exam_logger.log(
        gaze,
        head,
        angle,
        effective_face_count,
        score,
        risk_level,
        ",".join(detected_objects),
    )

    # Draw overlay
    cv2.putText(frame, f"Gaze: {gaze}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, f"Head: {head}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    cv2.putText(frame, f"Suspicion Score: {score}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    cv2.putText(frame, f"Risk Level: {risk_level}", (20, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.8, risk_color, 2)
    cv2.putText(
        frame,
        f"Engine: {analysis_engine} | Src: {gaze_source} {gaze_confidence:.2f}",
        (20, 160),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        2,
    )
    cv2.putText(
        frame,
        f"Faces: {effective_face_count}",
        (20, 190),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 0),
        2,
    )

    # Body & hand alerts
    alert_y = 220
    for alert in body_alerts + hand_alerts:
        cv2.putText(frame, f"ALERT: {alert}", (20, alert_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 100, 255), 2)
        alert_y += 25

    cv2.putText(frame, f"FPS: {fps}", (20, h - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

    if violation_type:
        cv2.putText(frame, violation_type, (20, h - 60), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 255), 2)

    if prohibited_object_detected:
        cv2.putText(
            frame,
            f"OBJECT: {', '.join(detected_objects)}",
            (w - 360, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.75,
            (0, 0, 255),
            2,
        )

    cv2.imshow("AI Online Exam Proctoring", frame)
    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()
