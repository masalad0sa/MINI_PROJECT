import math


class HeadPoseEstimator:
    def __init__(self, smooth_alpha=0.35):
        self.smooth_alpha = max(0.05, min(0.95, float(smooth_alpha)))
        self.smoothed_yaw = None
        self.smoothed_pitch = None
        self.smoothed_roll = None
        self.yaw_bias = 0.0
        self.pitch_bias = 0.0
        self.last_direction = "HEAD STRAIGHT"
        self.last_metrics = {
            "raw_yaw": 0.0,
            "raw_pitch": 0.0,
            "raw_roll": 0.0,
            "yaw": 0.0,
            "pitch": 0.0,
            "roll": 0.0,
        }

    def reset(self):
        self.smoothed_yaw = None
        self.smoothed_pitch = None
        self.smoothed_roll = None
        self.yaw_bias = 0.0
        self.pitch_bias = 0.0
        self.last_direction = "HEAD STRAIGHT"
        self.last_metrics = {
            "raw_yaw": 0.0,
            "raw_pitch": 0.0,
            "raw_roll": 0.0,
            "yaw": 0.0,
            "pitch": 0.0,
            "roll": 0.0,
        }

    def _ema(self, previous, current):
        if previous is None:
            return float(current)
        return ((1.0 - self.smooth_alpha) * float(previous)) + (
            self.smooth_alpha * float(current)
        )

    def estimate(self, landmarks):
        try:
            left_eye = landmarks[33]
            right_eye = landmarks[263]
            nose_tip = landmarks[1]
            chin = landmarks[152]
            forehead = landmarks[10]
        except IndexError:
            self.last_direction = "HEAD STRAIGHT"
            return "HEAD STRAIGHT", 0.0

        dx = right_eye.x - left_eye.x
        dy = right_eye.y - left_eye.y
        raw_roll = math.degrees(math.atan2(dy, dx))

        eye_center_x = (left_eye.x + right_eye.x) / 2.0
        eye_distance = max(1e-6, abs(dx))
        raw_yaw = (nose_tip.x - eye_center_x) / eye_distance

        eye_line_y = (left_eye.y + right_eye.y) / 2.0
        face_height = max(1e-6, chin.y - forehead.y)
        raw_pitch = (nose_tip.y - eye_line_y) / face_height

        self.smoothed_yaw = self._ema(self.smoothed_yaw, raw_yaw)
        self.smoothed_pitch = self._ema(self.smoothed_pitch, raw_pitch)
        self.smoothed_roll = self._ema(self.smoothed_roll, raw_roll)

        # Dynamic center calibration to avoid per-person and camera-offset bias.
        if abs(self.smoothed_yaw - self.yaw_bias) < 0.08:
            self.yaw_bias = (0.98 * self.yaw_bias) + (0.02 * self.smoothed_yaw)
        if abs(self.smoothed_pitch - self.pitch_bias) < 0.08:
            self.pitch_bias = (0.98 * self.pitch_bias) + (0.02 * self.smoothed_pitch)

        yaw = self.smoothed_yaw - self.yaw_bias
        pitch = self.smoothed_pitch - self.pitch_bias
        roll = self.smoothed_roll
        self.last_metrics = {
            "raw_yaw": float(raw_yaw),
            "raw_pitch": float(raw_pitch),
            "raw_roll": float(raw_roll),
            "yaw": float(yaw),
            "pitch": float(pitch),
            "roll": float(roll),
        }

        # Hysteresis for stable direction labels.
        if self.last_direction == "HEAD TURN LEFT" and yaw < -0.12:
            return "HEAD TURN LEFT", roll
        if self.last_direction == "HEAD TURN RIGHT" and yaw > 0.12:
            return "HEAD TURN RIGHT", roll
        if self.last_direction == "HEAD UP" and pitch < 0.06:
            return "HEAD UP", roll
        if self.last_direction == "HEAD DOWN" and pitch > 0.24:
            return "HEAD DOWN", roll

        if yaw < -0.18:
            self.last_direction = "HEAD TURN LEFT"
            return "HEAD TURN LEFT", roll
        if yaw > 0.18:
            self.last_direction = "HEAD TURN RIGHT"
            return "HEAD TURN RIGHT", roll
        if pitch < 0.03:
            self.last_direction = "HEAD UP"
            return "HEAD UP", roll
        if pitch > 0.28:
            self.last_direction = "HEAD DOWN"
            return "HEAD DOWN", roll
        if roll > 18:
            self.last_direction = "HEAD TILT RIGHT"
            return "HEAD TILT RIGHT", roll
        if roll < -18:
            self.last_direction = "HEAD TILT LEFT"
            return "HEAD TILT LEFT", roll

        self.last_direction = "HEAD STRAIGHT"
        return "HEAD STRAIGHT", roll
