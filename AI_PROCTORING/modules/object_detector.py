import os
from pathlib import Path

from ultralytics import YOLO


class ObjectDetector:
    """YOLOv8-based prohibited object detector.

    Defaults to YOLOv8s (small) for better accuracy on partially-visible
    objects at the edge of the webcam frame.  Falls back to YOLOv8n if
    the small weights are not found locally (auto-downloads on first run
    if internet is available).
    """

    def __init__(self, default_conf_threshold=0.55):
        # Try yolov8s first (better accuracy for partial objects), then yolov8n
        base_dir = Path(__file__).resolve().parent.parent
        model_candidates = [
            base_dir / "yolov8s.pt",
            base_dir / "yolov8n.pt",
        ]

        model_path = None
        for candidate in model_candidates:
            if candidate.exists():
                model_path = str(candidate)
                break

        if model_path is None:
            # Auto-download yolov8s (preferred) or fall back to yolov8n
            env_model = os.getenv("YOLO_MODEL", "yolov8s.pt").strip()
            model_path = env_model
            print(f"[ObjectDetector] No local weights found; using '{model_path}' (will auto-download)")

        self.model = YOLO(model_path)
        self.model_name = Path(model_path).stem
        self.default_conf_threshold = default_conf_threshold

        # Objects we consider suspicious / prohibited during exams
        self.prohibited_objects = {
            "cell phone",
            "book",
            "laptop",
            "tablet",
            "remote",
        }

        # Normalize close synonyms from different detector labels
        self.label_aliases = {
            "mobile phone": "cell phone",
            "smartphone": "cell phone",
            "phone": "cell phone",
            "notebook": "book",
            "ipad": "tablet",
            # Removed: "tv" and "monitor" cause too many false positives
        }

    def _normalize_label(self, label):
        if not label:
            return ""
        lowered = str(label).strip().lower()
        return self.label_aliases.get(lowered, lowered)

    def detect(self, frame, conf_threshold=None, with_metadata=False):
        threshold = (
            self.default_conf_threshold
            if conf_threshold is None
            else float(conf_threshold)
        )

        # Use larger inference size for better small/partial object detection
        imgsz = int(os.getenv("YOLO_IMGSZ", "832"))
        results = self.model(frame, conf=threshold, imgsz=imgsz, verbose=False)
        detected_scores = {}
        raw_matches = []

        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                raw_label = self.model.names[cls_id]
                label = self._normalize_label(raw_label)
                confidence = float(box.conf[0]) if box.conf is not None else 0.0

                if label in self.prohibited_objects and confidence >= threshold:
                    previous = detected_scores.get(label, 0.0)
                    detected_scores[label] = max(previous, confidence)

                    # Extract bounding box for metadata
                    bbox = None
                    if box.xyxy is not None and len(box.xyxy) > 0:
                        xyxy = box.xyxy[0].tolist()
                        bbox = {
                            "x1": round(xyxy[0], 1),
                            "y1": round(xyxy[1], 1),
                            "x2": round(xyxy[2], 1),
                            "y2": round(xyxy[3], 1),
                        }

                    match_data = {
                        "label": label,
                        "raw_label": raw_label,
                        "confidence": round(confidence, 4),
                    }
                    if bbox:
                        match_data["bbox"] = bbox
                    raw_matches.append(match_data)

        labels = sorted(detected_scores.keys())
        if not with_metadata:
            return labels

        return {
            "labels": labels,
            "scores": {
                label: round(detected_scores[label], 4)
                for label in sorted(detected_scores.keys())
            },
            "detections": sorted(
                raw_matches,
                key=lambda item: item.get("confidence", 0.0),
                reverse=True,
            ),
            "model": self.model_name,
        }
