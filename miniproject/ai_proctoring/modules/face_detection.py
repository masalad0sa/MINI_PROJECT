import mediapipe as mp
import cv2

class FaceDetector:
    def __init__(self, confidence=0.6):
        self.mp_face = mp.solutions.face_detection
        self.face_detection = self.mp_face.FaceDetection(
            model_selection=0,
            min_detection_confidence=confidence
        )

    def detect_faces(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_detection.process(rgb)

        if not results.detections:
            return 0, []

        return len(results.detections), results.detections

    def draw_faces(self, frame, detections):
        h, w, _ = frame.shape
        for det in detections:
            bbox = det.location_data.relative_bounding_box
            x = int(bbox.xmin * w)
            y = int(bbox.ymin * h)
            bw = int(bbox.width * w)
            bh = int(bbox.height * h)
            cv2.rectangle(frame, (x, y), (x + bw, y + bh), (0, 255, 0), 2)

print("face_detection.py loaded successfully")
print("FaceDetector exists:", "FaceDetector" in dir())
