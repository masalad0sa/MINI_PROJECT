import time

class BehaviorAnalyzer:
    def __init__(self):
        self.suspicion_score = 0
        self.total_events = 0      # 👈 important
        self.abnormal_start = None
        self.last_decay_time = time.time()

    def analyze(self, gaze, head):
        current_time = time.time()
        abnormal = (gaze != "LOOKING CENTER" or head != "HEAD STRAIGHT")

        if abnormal:
            if self.abnormal_start is None:
                self.abnormal_start = current_time
            elif current_time - self.abnormal_start > 2.5:
                self.suspicion_score += 1
                self.total_events += 1   # 👈 event logged
                self.abnormal_start = current_time
        else:
            self.abnormal_start = None
            if current_time - self.last_decay_time > 3:
                self.suspicion_score = max(0, self.suspicion_score - 1)
                self.last_decay_time = current_time

        return self.suspicion_score
