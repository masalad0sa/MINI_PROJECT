from pathlib import Path
from ultralytics import YOLO


class ObjectDetector:
    def __init__(self, default_conf_threshold=0.35):
        model_path = Path(__file__).resolve().parent.parent / "yolov8n.pt"
        self.model = YOLO(str(model_path))
        self.default_conf_threshold = default_conf_threshold

        # Objects we consider suspicious
        self.prohibited_objects = {"cell phone", "book"}
        # Normalize close synonyms from different detector labels.
        self.label_aliases = {
            "mobile phone": "cell phone",
            "smartphone": "cell phone",
            "phone": "cell phone",
            "notebook": "book",
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
        results = self.model(frame, conf=threshold, verbose=False)
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
                    raw_matches.append(
                        {
                            "label": label,
                            "raw_label": raw_label,
                            "confidence": round(confidence, 4),
                        }
                    )

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
        }
