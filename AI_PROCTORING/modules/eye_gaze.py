import numpy as np


class EyeGazeTracker:
    def __init__(self, smooth_alpha=0.35):
        self.smooth_alpha = float(np.clip(smooth_alpha, 0.05, 0.95))
        self.smoothed_ratio = None
        self.baseline_ratio = None
        self.last_direction = "LOOKING CENTER"
        self.last_raw_ratio = 0.5
        self.last_normalized_ratio = 0.5

    def reset(self):
        self.smoothed_ratio = None
        self.baseline_ratio = None
        self.last_direction = "LOOKING CENTER"
        self.last_raw_ratio = 0.5
        self.last_normalized_ratio = 0.5

    def get_gaze_direction(self, landmarks, img_w, img_h):
        try:
            left_ratio, left_width = self._eye_ratio(
                landmarks,
                left_idx=33,
                right_idx=133,
                iris_indices=(468, 469, 470, 471, 472),
                img_w=img_w,
            )
            right_ratio, right_width = self._eye_ratio(
                landmarks,
                left_idx=362,
                right_idx=263,
                iris_indices=(473, 474, 475, 476, 477),
                img_w=img_w,
            )
        except (IndexError, ZeroDivisionError):
            self.last_direction = "LOOKING CENTER"
            return "LOOKING CENTER"

        # Eye box too small usually means unreliable iris signal.
        min_eye_width_px = 8.0
        if left_width < min_eye_width_px or right_width < min_eye_width_px:
            self.last_direction = "LOOKING CENTER"
            return "LOOKING CENTER"

        raw_ratio = float(np.clip((left_ratio + right_ratio) / 2.0, 0.0, 1.0))
        self.last_raw_ratio = raw_ratio
        if self.smoothed_ratio is None:
            self.smoothed_ratio = raw_ratio
        else:
            self.smoothed_ratio = (
                (1.0 - self.smooth_alpha) * self.smoothed_ratio
                + self.smooth_alpha * raw_ratio
            )

        # Self-calibrate center per user and camera when values are near neutral.
        if self.baseline_ratio is None:
            self.baseline_ratio = self.smoothed_ratio
        elif abs(self.smoothed_ratio - self.baseline_ratio) < 0.08:
            self.baseline_ratio = (0.97 * self.baseline_ratio) + (0.03 * self.smoothed_ratio)

        normalized_ratio = float(
            np.clip(self.smoothed_ratio - self.baseline_ratio + 0.5, 0.0, 1.0)
        )
        self.last_normalized_ratio = normalized_ratio

        # Hysteresis to avoid left/right flicker around boundaries.
        if self.last_direction == "LOOKING LEFT":
            if normalized_ratio > 0.42:
                self.last_direction = "LOOKING CENTER"
            else:
                return "LOOKING LEFT"
        elif self.last_direction == "LOOKING RIGHT":
            if normalized_ratio < 0.58:
                self.last_direction = "LOOKING CENTER"
            else:
                return "LOOKING RIGHT"

        if normalized_ratio < 0.31:
            self.last_direction = "LOOKING LEFT"
            return "LOOKING LEFT"
        if normalized_ratio > 0.69:
            self.last_direction = "LOOKING RIGHT"
            return "LOOKING RIGHT"

        self.last_direction = "LOOKING CENTER"
        return "LOOKING CENTER"

    def _eye_ratio(self, landmarks, left_idx, right_idx, iris_indices, img_w):
        x_left = float(landmarks[left_idx].x * img_w)
        x_right = float(landmarks[right_idx].x * img_w)
        iris_x_values = [float(landmarks[idx].x * img_w) for idx in iris_indices]
        x_iris = float(np.mean(iris_x_values))

        width = max(1.0, abs(x_right - x_left))
        if x_right >= x_left:
            ratio = (x_iris - x_left) / width
        else:
            ratio = (x_left - x_iris) / width

        return float(np.clip(ratio, 0.0, 1.0)), width
