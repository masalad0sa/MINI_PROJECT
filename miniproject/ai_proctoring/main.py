import cv2
import time
from modules.webcam import Webcam
from modules.face_detection import FaceDetector

def main():
    webcam = Webcam()
    face_detector = FaceDetector()

    face_absent_start = None

    while True:
        frame = webcam.get_frame()
        if frame is None:
            break

        face_count, detections = face_detector.detect_faces(frame)

        # ---------- FACE STATUS LOGIC ----------
        if face_count == 0:
            status = "FACE ABSENT"
            color = (0, 0, 255)

            if face_absent_start is None:
                face_absent_start = time.time()
            absent_time = int(time.time() - face_absent_start)
            status += f" ({absent_time}s)"

        elif face_count == 1:
            status = "SINGLE FACE"
            color = (0, 255, 0)
            face_absent_start = None

        else:
            status = "MULTIPLE FACES"
            color = (0, 165, 255)
            face_absent_start = None

        # Draw face boxes
        face_detector.draw_faces(frame, detections)

        # Display status
        cv2.putText(
            frame,
            status,
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            color,
            2
        )

        cv2.imshow("AI Exam Proctoring - Day 1", frame)

        if cv2.waitKey(1) & 0xFF == 27:  # ESC to exit
            break

    webcam.release()

if __name__ == "__main__":
    main()
