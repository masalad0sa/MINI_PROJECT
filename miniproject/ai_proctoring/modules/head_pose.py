import math

class HeadPoseEstimator:
    def estimate(self, landmarks):
        left_eye = landmarks[33]
        right_eye = landmarks[263]

        dx = right_eye.x - left_eye.x
        dy = right_eye.y - left_eye.y

        angle = math.degrees(math.atan2(dy, dx))

        # 🔥 tolerance zone
        if abs(angle) < 8:
            return "HEAD STRAIGHT", angle
        elif angle > 8:
            return "HEAD TILT RIGHT", angle
        else:
            return "HEAD TILT LEFT", angle
