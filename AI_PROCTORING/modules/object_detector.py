from ultralytics import YOLO

class ObjectDetector:
    def __init__(self):
        self.model = YOLO("yolov8n.pt")  # lightweight & fast

        # Objects we consider suspicious
        self.prohibited_objects = ["cell phone", "book"]

    def detect(self, frame):
        results = self.model(frame, conf=0.4, verbose=False)

        detected_objects = []

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                label = self.model.names[cls_id]

                if label in self.prohibited_objects:
                    detected_objects.append(label)

        return detected_objects
