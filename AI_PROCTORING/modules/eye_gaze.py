import numpy as np


class EyeGazeTracker:
    def __init__(self, smooth_alpha=0.4):
        self.smooth_alpha = float(np.clip(smooth_alpha, 0.05, 0.95))
        self.smoothed_h_ratio = None
        self.smoothed_v_ratio = None
        self.baseline_h_ratio = None
        self.baseline_v_ratio = None
        self.last_direction = "LOOKING CENTER"
        self.last_raw_ratio = 0.5
        self.last_normalized_ratio = 0.5
        self.last_raw_v_ratio = 0.5
        self.last_normalized_v_ratio = 0.5

    def reset(self):
        self.smoothed_h_ratio = None
        self.smoothed_v_ratio = None
        self.baseline_h_ratio = None
        self.baseline_v_ratio = None
        self.last_direction = "LOOKING CENTER"
        self.last_raw_ratio = 0.5
        self.last_normalized_ratio = 0.5
        self.last_raw_v_ratio = 0.5
        self.last_normalized_v_ratio = 0.5

    def get_gaze_direction(self, landmarks, img_w, img_h):
        try:
            left_h_ratio, left_width = self._eye_h_ratio(
                landmarks,
                left_idx=33,
                right_idx=133,
                iris_indices=(468, 469, 470, 471, 472),
                img_w=img_w,
            )
            right_h_ratio, right_width = self._eye_h_ratio(
                landmarks,
                left_idx=362,
                right_idx=263,
                iris_indices=(473, 474, 475, 476, 477),
                img_w=img_w,
            )
            # Vertical gaze: iris Y relative to upper/lower eyelid
            left_v_ratio = self._eye_v_ratio(
                landmarks,
                upper_idx=159,   # left eye upper lid
                lower_idx=145,   # left eye lower lid
                iris_indices=(468, 469, 470, 471, 472),
                img_h=img_h,
            )
            right_v_ratio = self._eye_v_ratio(
                landmarks,
                upper_idx=386,   # right eye upper lid
                lower_idx=374,   # right eye lower lid
                iris_indices=(473, 474, 475, 476, 477),
                img_h=img_h,
            )
        except (IndexError, ZeroDivisionError):
            self.last_direction = "LOOKING CENTER"
            return "LOOKING CENTER"

        # Eye box too small usually means unreliable iris signal.
        min_eye_width_px = 8.0
        if left_width < min_eye_width_px or right_width < min_eye_width_px:
            self.last_direction = "LOOKING CENTER"
            return "LOOKING CENTER"

        # --- Horizontal gaze ---
        raw_h = float(np.clip((left_h_ratio + right_h_ratio) / 2.0, 0.0, 1.0))
        self.last_raw_ratio = raw_h
        if self.smoothed_h_ratio is None:
            self.smoothed_h_ratio = raw_h
        else:
            self.smoothed_h_ratio = (
                (1.0 - self.smooth_alpha) * self.smoothed_h_ratio
                + self.smooth_alpha * raw_h
            )

        if self.baseline_h_ratio is None:
            self.baseline_h_ratio = self.smoothed_h_ratio
        elif abs(self.smoothed_h_ratio - self.baseline_h_ratio) < 0.08:
            self.baseline_h_ratio = (0.97 * self.baseline_h_ratio) + (0.03 * self.smoothed_h_ratio)

        norm_h = float(
            np.clip(self.smoothed_h_ratio - self.baseline_h_ratio + 0.5, 0.0, 1.0)
        )
        self.last_normalized_ratio = norm_h

        # --- Vertical gaze ---
        raw_v = float(np.clip((left_v_ratio + right_v_ratio) / 2.0, 0.0, 1.0))
        self.last_raw_v_ratio = raw_v
        if self.smoothed_v_ratio is None:
            self.smoothed_v_ratio = raw_v
        else:
            self.smoothed_v_ratio = (
                (1.0 - self.smooth_alpha) * self.smoothed_v_ratio
                + self.smooth_alpha * raw_v
            )

        if self.baseline_v_ratio is None:
            self.baseline_v_ratio = self.smoothed_v_ratio
        elif abs(self.smoothed_v_ratio - self.baseline_v_ratio) < 0.08:
            self.baseline_v_ratio = (0.97 * self.baseline_v_ratio) + (0.03 * self.smoothed_v_ratio)

        norm_v = float(
            np.clip(self.smoothed_v_ratio - self.baseline_v_ratio + 0.5, 0.0, 1.0)
        )
        self.last_normalized_v_ratio = norm_v

        # --- Direction decision with hysteresis ---
        # Horizontal thresholds (widened for better sensitivity)
        h_enter_left = 0.36
        h_exit_left = 0.44
        h_enter_right = 0.64
        h_exit_right = 0.56

        # Vertical thresholds
        v_enter_up = 0.38
        v_exit_up = 0.45
        v_enter_down = 0.62
        v_exit_down = 0.55

        # Hysteresis: stay in current direction until clearly returning to center
        if self.last_direction == "LOOKING LEFT":
            if norm_h > h_exit_left:
                self.last_direction = "LOOKING CENTER"
            else:
                return "LOOKING LEFT"
        elif self.last_direction == "LOOKING RIGHT":
            if norm_h < h_exit_right:
                self.last_direction = "LOOKING CENTER"
            else:
                return "LOOKING RIGHT"
        elif self.last_direction == "LOOKING UP":
            if norm_v > v_exit_up:
                self.last_direction = "LOOKING CENTER"
            else:
                return "LOOKING UP"
        elif self.last_direction == "LOOKING DOWN":
            if norm_v < v_exit_down:
                self.last_direction = "LOOKING CENTER"
            else:
                return "LOOKING DOWN"

        # Check for new direction
        if norm_h < h_enter_left:
            self.last_direction = "LOOKING LEFT"
            return "LOOKING LEFT"
        if norm_h > h_enter_right:
            self.last_direction = "LOOKING RIGHT"
            return "LOOKING RIGHT"
        if norm_v < v_enter_up:
            self.last_direction = "LOOKING UP"
            return "LOOKING UP"
        if norm_v > v_enter_down:
            self.last_direction = "LOOKING DOWN"
            return "LOOKING DOWN"

        self.last_direction = "LOOKING CENTER"
        return "LOOKING CENTER"

    def _eye_h_ratio(self, landmarks, left_idx, right_idx, iris_indices, img_w):
        """Horizontal iris position: 0 = left corner, 1 = right corner."""
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

    def _eye_v_ratio(self, landmarks, upper_idx, lower_idx, iris_indices, img_h):
        """Vertical iris position: 0 = upper lid, 1 = lower lid."""
        y_upper = float(landmarks[upper_idx].y * img_h)
        y_lower = float(landmarks[lower_idx].y * img_h)
        iris_y_values = [float(landmarks[idx].y * img_h) for idx in iris_indices]
        y_iris = float(np.mean(iris_y_values))

        height = max(1.0, abs(y_lower - y_upper))
        ratio = (y_iris - y_upper) / height

        return float(np.clip(ratio, 0.0, 1.0))

