import time


class BehaviorAnalyzer:
    def __init__(self):
        self.suspicion_score = 0.0
        self.total_events = 0
        self.abnormal_streak = 0
        self.normal_streak = 0
        self.tilt_streak = 0
        self.last_update = time.time()
        self.last_increment_at = 0.0

    def analyze(self, gaze, head):
        now = time.time()
        raw_elapsed = max(0.1, now - self.last_update)
        # Cap elapsed so decay works correctly at any frame rate (1 FPS web, 30 FPS local).
        elapsed = min(raw_elapsed, 0.5)
        self.last_update = now

        gaze_abnormal = gaze not in {"LOOKING CENTER"}
        head_hard_abnormal = head in {
            "HEAD TURN LEFT",
            "HEAD TURN RIGHT",
            "HEAD UP",
            "HEAD DOWN",
        }
        head_tilt = head in {"HEAD TILT LEFT", "HEAD TILT RIGHT"}
        if head_tilt:
            self.tilt_streak += 1
        else:
            self.tilt_streak = max(0, self.tilt_streak - 1)

        # Mild head tilt alone should not immediately raise suspicion.
        head_abnormal = head_hard_abnormal or (head_tilt and self.tilt_streak >= 5)
        abnormal = gaze_abnormal or head_abnormal

        if abnormal:
            self.abnormal_streak += 1
            self.normal_streak = 0

            # At low FPS (web), we only get ~1 frame/sec, so lower the jitter threshold.
            can_increment = self.abnormal_streak >= 1
            if can_increment:
                increment = 0.9
                if gaze_abnormal and head_abnormal:
                    increment += 0.8
                if self.abnormal_streak >= 3:
                    increment += 0.7

                self.suspicion_score = min(100.0, self.suspicion_score + increment)
                self.total_events += 1
                self.last_increment_at = now
        else:
            self.normal_streak += 1
            self.abnormal_streak = max(0, self.abnormal_streak - 1)
            decay_rate = 4.5 if self.normal_streak >= 2 else 3.0
            self.suspicion_score = max(0.0, self.suspicion_score - (decay_rate * elapsed))

        return int(round(self.suspicion_score))

    def add_penalty(self, points):
        self.suspicion_score = min(100.0, self.suspicion_score + max(0.0, float(points)))
        return int(round(self.suspicion_score))

    def reduce_penalty(self, points):
        self.suspicion_score = max(0.0, self.suspicion_score - max(0.0, float(points)))
        return int(round(self.suspicion_score))

    def reset(self):
        self.suspicion_score = 0.0
        self.total_events = 0
        self.abnormal_streak = 0
        self.normal_streak = 0
        self.tilt_streak = 0
        self.last_update = time.time()
        self.last_increment_at = 0.0
