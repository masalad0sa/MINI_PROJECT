import csv
import os
import time


class ExamLogger:
    def __init__(self, filename="exam_log.csv"):
        self.filename = filename

        if not os.path.exists(self.filename):
            with open(self.filename, mode="w", newline="") as file:
                writer = csv.writer(file)
                writer.writerow([
                    "timestamp",
                    "gaze",
                    "head",
                    "angle",
                    "face_count",
                    "multi_face",
                    "suspicion_score",
                    "risk_level",
                    "phone_detected"
                ])

    def log(self, gaze, head, angle, face_count, score, risk,detected_objects):
        multi_face = 1 if face_count > 1 else 0
        
        with open(self.filename, mode="a", newline="") as file:
            writer = csv.writer(file)
            writer.writerow([
            time.strftime("%Y-%m-%d %H:%M:%S"),
            gaze,
            head,
            int(angle),
            face_count,
            multi_face,
            score,
            risk,
            detected_objects
        ])

