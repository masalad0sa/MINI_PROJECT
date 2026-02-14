import cv2
import time
import os
from datetime import datetime

EVIDENCE_DIR = "evidence"
os.makedirs(EVIDENCE_DIR, exist_ok=True)

evidence_captured = False


# ---------- MODULE IMPORTS ----------
from modules.face_detection import FaceDetector
from modules.face_mesh import FaceMeshDetector
from modules.eye_gaze import EyeGazeTracker
from modules.head_pose import HeadPoseEstimator
from modules.behavior import BehaviorAnalyzer
from modules.logger import ExamLogger
from modules.object_detector import ObjectDetector

object_detector = ObjectDetector()

# ---------- INITIALIZE ----------
cap = cv2.VideoCapture(0)  # camera index = 0

face_detector = FaceDetector()
mesh_detector = FaceMeshDetector()
gaze_tracker = EyeGazeTracker()
head_pose = HeadPoseEstimator()
behavior_analyzer = BehaviorAnalyzer()
exam_logger = ExamLogger()

prev_time = 0

# ---------- MAIN LOOP ----------
while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape

    # ---------- FPS ----------
    curr_time = time.time()
    fps = int(1 / (curr_time - prev_time)) if prev_time != 0 else 0
    prev_time = curr_time

    # ---------- FACE DETECTION ----------
    frame, face_count = face_detector.detect_faces(frame)
    frame = frame.astype("uint8")
    multi_face_detected = face_count > 1

    # ---------- FACE MESH ----------
    mesh_results = mesh_detector.process(frame)
    detected_objects = object_detector.detect(frame)
    phone_detected = "cell phone" in detected_objects

    def get_risk_level(score, multi_face):
        if multi_face or score >= 40:
            return "HIGH", (0, 0, 255)      # Red
        elif score >= 15:
            return "MEDIUM", (0, 255, 255)  # Yellow
        else:
            return "LOW", (0, 255, 0)       # Green


    if mesh_results.multi_face_landmarks:
        for face_landmarks in mesh_results.multi_face_landmarks:
            landmarks = face_landmarks.landmark

            # ---------- DAY 3 LOGIC ----------
            gaze = gaze_tracker.get_gaze_direction(landmarks, w, h)
            head, angle = head_pose.estimate(landmarks)
            score = behavior_analyzer.analyze(gaze, head)
            score = behavior_analyzer.analyze(gaze, head)
            risk_level, risk_color = get_risk_level(score, multi_face_detected)

# ---------- EVIDENCE CAPTURE ----------
        if risk_level == "HIGH" and not evidence_captured:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            reason = "MULTI_FACE" if multi_face_detected else "SUSPICIOUS_BEHAVIOR"

            filename = os.path.join(
            EVIDENCE_DIR,
            f"evidence_{reason}_{timestamp}.jpg"
        )

            cv2.imwrite(filename, frame)
            evidence_captured = True

        elif risk_level != "HIGH":
            evidence_captured = False



            if multi_face_detected:
                 score += 5   # small but strong signal
            if phone_detected:
                score += 10
                risk_level = "HIGH"

            exam_logger.log(gaze, head, angle, face_count, score, risk_level,phone_detected)


            # ---------- DISPLAY ----------
            cv2.putText(frame, f"Gaze: {gaze}", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            cv2.putText(frame, f"Head: {head}", (20, 70),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            cv2.putText(frame, f"Suspicion Score: {score}", (20, 100),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            cv2.putText(frame, f"Angle: {int(angle)}", (20, 130),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
            cv2.putText(frame, f"Risk Level: {risk_level}",
            (20, 160),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8, risk_color, 2)
            if risk_level == "HIGH":
                cv2.putText(frame, "EVIDENCE CAPTURED",
                (w - 320, 80),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7, (0, 0, 255), 2)
            if phone_detected:
                cv2.putText(frame, "WARNING: PHONE DETECTED",
                (w - 380, 120),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8, (0, 0, 255), 2)

    # ---------- GLOBAL INFO ----------
    cv2.putText(frame, f"Faces Detected: {face_count}", (20, h - 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

    cv2.putText(frame, f"FPS: {fps}", (20, h - 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

    cv2.imshow("AI Online Exam Proctoring", frame)

    if cv2.waitKey(1) & 0xFF == 27:  # ESC key
        break

# ---------- CLEANUP ----------
cap.release()
cv2.destroyAllWindows()
