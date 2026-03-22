import numpy as np


class EyeGazeTracker:
    def __init__(self, smooth_alpha=0.4):
        self.smooth_alpha = float(np.clip(smooth_alpha, 0.05, 0.95))
        # Vertical gaze tends to have a smaller dynamic range than horizontal.
        # Apply a modest gain after baseline normalization for better UP/DOWN sensitivity.
        self.vertical_gain = 1.4
        self.min_eye_height_px = 5.0
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

    def get_gaze_direction(self, landmarks, img_w, img_h, head_pitch=None):
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
            left_v_ratio, left_height = self._eye_v_ratio(
                landmarks,
                upper_indices=(159, 160, 161),
                lower_indices=(145, 153, 154),
                iris_indices=(468, 469, 470, 471, 472),
                img_h=img_h,
            )
            right_v_ratio, right_height = self._eye_v_ratio(
                landmarks,
                upper_indices=(386, 387, 388),
                lower_indices=(374, 380, 381),
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
        # If eyelid gap is too small (blink/squint), keep last stable value instead
        # of injecting noisy vertical spikes.
        valid_vertical = (
            left_height >= self.min_eye_height_px and right_height >= self.min_eye_height_px
        )
        if valid_vertical:
            raw_v = float(np.clip((left_v_ratio + right_v_ratio) / 2.0, 0.0, 1.0))
            self.last_raw_v_ratio = raw_v
            if self.smoothed_v_ratio is None:
                self.smoothed_v_ratio = raw_v
            else:
                self.smoothed_v_ratio = (
                    (1.0 - self.smooth_alpha) * self.smoothed_v_ratio
                    + self.smooth_alpha * raw_v
                )
        elif self.smoothed_v_ratio is None:
            self.smoothed_v_ratio = self.last_raw_v_ratio

        if self.baseline_v_ratio is None:
            self.baseline_v_ratio = self.smoothed_v_ratio
        elif abs(self.smoothed_v_ratio - self.baseline_v_ratio) < 0.06:
            self.baseline_v_ratio = (0.98 * self.baseline_v_ratio) + (0.02 * self.smoothed_v_ratio)

        norm_v = float(
            np.clip(
                ((self.smoothed_v_ratio - self.baseline_v_ratio) * self.vertical_gain) + 0.5,
                0.0,
                1.0,
            )
        )

        # Head pitch changes apparent vertical iris position. Damp the vertical
        # gaze signal as pitch magnitude increases to avoid false LOOKING UP/DOWN
        # when the user is mostly moving their head.
        if head_pitch is not None:
            pitch_mag = abs(float(head_pitch))
            pitch_suppression = float(np.clip((pitch_mag - 0.06) / 0.18, 0.0, 1.0))
            norm_v = 0.5 + ((norm_v - 0.5) * (1.0 - pitch_suppression))

        self.last_normalized_v_ratio = norm_v

        # --- Direction decision with hysteresis ---
        # Horizontal thresholds (widened for better sensitivity)
        h_enter_left = 0.36
        h_exit_left = 0.44
        h_enter_right = 0.64
        h_exit_right = 0.56

        # Vertical thresholds
        v_enter_up = 0.44
        v_exit_up = 0.47
        v_enter_down = 0.56
        v_exit_down = 0.53

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
        # Suppress vertical labels when head pitch is large; rely on head pose
        # labels in that case instead of misclassifying as gaze UP/DOWN.
        pitch_block_vertical = (
            head_pitch is not None and abs(float(head_pitch)) >= 0.18
        )
        if (not pitch_block_vertical) and norm_v < v_enter_up:
            self.last_direction = "LOOKING UP"
            return "LOOKING UP"
        if (not pitch_block_vertical) and norm_v > v_enter_down:
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

    def _eye_v_ratio(self, landmarks, upper_indices, lower_indices, iris_indices, img_h):
        """Vertical iris position: 0 = upper lid, 1 = lower lid."""
        y_upper_values = [float(landmarks[idx].y * img_h) for idx in upper_indices]
        y_lower_values = [float(landmarks[idx].y * img_h) for idx in lower_indices]
        y_upper = float(np.mean(y_upper_values))
        y_lower = float(np.mean(y_lower_values))
        iris_y_values = [float(landmarks[idx].y * img_h) for idx in iris_indices]
        y_iris = float(np.mean(iris_y_values))

        height = max(1.0, abs(y_lower - y_upper))
        ratio = (y_iris - y_upper) / height

        return float(np.clip(ratio, 0.0, 1.0)), float(height)

