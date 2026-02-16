import cv2
import mediapipe as mp


class FaceDetector:
    def __init__(
        self,
        min_detection_confidence=0.65,
        min_face_area_ratio=0.015,
    ):
        self.mp_face = mp.solutions.face_detection
        self.face = self.mp_face.FaceDetection(
            model_selection=0,
            min_detection_confidence=min_detection_confidence,
        )
        self.min_detection_confidence = min_detection_confidence
        self.min_face_area_ratio = min_face_area_ratio

    def detect_faces(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face.process(rgb)

        h, w, _ = frame.shape
        frame_area = float(h * w) if h > 0 and w > 0 else 1.0
        valid_detections = []

        if results.detections:
            for detection in results.detections:
                confidence = float(detection.score[0]) if detection.score else 0.0
                bbox = detection.location_data.relative_bounding_box

                x = max(0, int(bbox.xmin * w))
                y = max(0, int(bbox.ymin * h))
                width = max(0, int(bbox.width * w))
                height = max(0, int(bbox.height * h))
                area_ratio = (width * height) / frame_area

                if confidence < self.min_detection_confidence:
                    continue
                if area_ratio < self.min_face_area_ratio:
                    continue

                valid_detections.append((x, y, width, height, confidence))

        for x, y, width, height, confidence in valid_detections:
            cv2.rectangle(
                frame,
                (x, y),
                (x + width, y + height),
                (0, 255, 0),
                2,
            )
            cv2.putText(
                frame,
                f"{confidence:.2f}",
                (x, max(20, y - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 255, 0),
                1,
            )

        face_count = len(valid_detections)
        return frame, face_count
