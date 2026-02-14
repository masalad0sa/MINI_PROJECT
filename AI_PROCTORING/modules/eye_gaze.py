import numpy as np

class EyeGazeTracker:
    def get_gaze_direction(self, landmarks, img_w, img_h):
        # Left eye corners
        left_corner = landmarks[33]
        right_corner = landmarks[133]
        iris_center = landmarks[468]  # iris center

        x_left = int(left_corner.x * img_w)
        x_right = int(right_corner.x * img_w)
        x_iris = int(iris_center.x * img_w)

        eye_width = x_right - x_left
        gaze_ratio = (x_iris - x_left) / eye_width

        if gaze_ratio < 0.35:
            return "LOOKING LEFT"
        elif gaze_ratio > 0.65:
            return "LOOKING RIGHT"
        else:
            return "LOOKING CENTER"
