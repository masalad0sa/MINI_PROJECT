"""Unified behavior detector using MediaPipe Holistic.

Combines face mesh (478 landmarks), body pose (33 landmarks), and hand
landmarks (21 per hand) in a single model pass.  This serves as the
**primary** analysis engine — the separate face_mesh / head_pose /
eye_gaze modules are used as a fallback only when Holistic fails.

The public interface is a single ``analyze(frame)`` call that returns a
rich dict with gaze direction, head pose, body posture alerts, and hand
position flags.
"""

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np


@dataclass
class HolisticResult:
    """All-in-one result from a single frame analysis."""

    face_detected: bool = False
    face_count: int = 0

    # Eye gaze
    gaze_direction: str = "LOOKING CENTER"
    gaze_h_ratio: float = 0.5
    gaze_v_ratio: float = 0.5

    # Head pose
    head_direction: str = "HEAD STRAIGHT"
    head_yaw: float = 0.0
    head_pitch: float = 0.0
    head_roll: float = 0.0
    head_angle: float = 0.0

    # Body posture
    body_detected: bool = False
    body_alerts: List[str] = field(default_factory=list)
    body_leaning: str = "UPRIGHT"

    # Hands
    left_hand_detected: bool = False
    right_hand_detected: bool = False
    hand_alerts: List[str] = field(default_factory=list)

    # Suspicion hints (for the behavior analyzer to factor in)
    posture_suspicious: bool = False

    # Raw landmarks for downstream consumers if needed
    face_landmarks: Optional[object] = None
    pose_landmarks: Optional[object] = None


class HolisticDetector:
    """MediaPipe Holistic based student behavior detector.

    Parameters
    ----------
    static_image_mode : bool
        Set ``True`` for web sessions (frames < 5 FPS).  Set ``False``
        for 30 FPS local webcam.
    min_detection_confidence : float
        Minimum detection confidence for all sub-models.
    min_tracking_confidence : float
        Minimum tracking confidence (ignored in static mode).
    smooth_alpha : float
        EMA smoothing factor for gaze / head ratios (0 = no update, 1 = no smoothing).
    """

    def __init__(
        self,
        static_image_mode: bool = False,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
        smooth_alpha: float = 0.6,
    ):
        self.mp_holistic = mp.solutions.holistic
        self.holistic = self.mp_holistic.Holistic(
            static_image_mode=bool(static_image_mode),
            model_complexity=1,
            min_detection_confidence=float(min_detection_confidence),
            min_tracking_confidence=float(min_tracking_confidence),
            enable_segmentation=False,
            refine_face_landmarks=True,  # 478 landmarks with iris
        )
        self.smooth_alpha = float(np.clip(smooth_alpha, 0.05, 0.95))

        # Smoothed values
        self.smoothed_h_ratio: Optional[float] = None
        self.smoothed_v_ratio: Optional[float] = None
        self.baseline_h_ratio: Optional[float] = None
        self.baseline_v_ratio: Optional[float] = None

        self.smoothed_yaw: Optional[float] = None
        self.smoothed_pitch: Optional[float] = None
        self.smoothed_roll: Optional[float] = None
        self.yaw_bias: float = 0.0
        self.pitch_bias: float = 0.0

        # Hysteresis for direction labels
        self.last_gaze_direction: str = "LOOKING CENTER"
        self.last_head_direction: str = "HEAD STRAIGHT"

        # Vertical gaze gain
        self.vertical_gain: float = 0.9  # Conservative gain to reduce false LOOKING UP/DOWN
        self.min_eye_height_px: float = 5.0

    def close(self):
        """Release MediaPipe resources."""
        try:
            self.holistic.close()
        except Exception:
            pass

    def reset(self):
        """Reset all smoothing / baseline state."""
        self.smoothed_h_ratio = None
        self.smoothed_v_ratio = None
        self.baseline_h_ratio = None
        self.baseline_v_ratio = None
        self.smoothed_yaw = None
        self.smoothed_pitch = None
        self.smoothed_roll = None
        self.yaw_bias = 0.0
        self.pitch_bias = 0.0
        self.last_gaze_direction = "LOOKING CENTER"
        self.last_head_direction = "HEAD STRAIGHT"

    def apply_calibration(
        self,
        gaze_h_baseline: Optional[float] = None,
        gaze_v_baseline: Optional[float] = None,
        head_yaw_baseline: Optional[float] = None,
        head_pitch_baseline: Optional[float] = None,
    ):
        """Apply pre-computed calibration baselines."""
        if gaze_h_baseline is not None:
            self.baseline_h_ratio = gaze_h_baseline
            self.smoothed_h_ratio = gaze_h_baseline
        if gaze_v_baseline is not None:
            self.baseline_v_ratio = gaze_v_baseline
            self.smoothed_v_ratio = gaze_v_baseline
        if head_yaw_baseline is not None:
            self.yaw_bias = head_yaw_baseline
            self.smoothed_yaw = head_yaw_baseline
        if head_pitch_baseline is not None:
            self.pitch_bias = head_pitch_baseline
            self.smoothed_pitch = head_pitch_baseline

    # ── Public API ────────────────────────────────────────────────

    def analyze(self, frame: np.ndarray) -> HolisticResult:
        """Run full holistic analysis on a single BGR frame.

        Returns a :class:`HolisticResult` with all detections populated.
        If the face is not detected, most fields keep their defaults.
        """
        result = HolisticResult()
        if frame is None or frame.size == 0:
            return result

        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_result = self.holistic.process(rgb)

        # ── Face ──────────────────────────────────────────────────
        if mp_result.face_landmarks:
            result.face_detected = True
            result.face_count = 1  # Holistic only does one face
            result.face_landmarks = mp_result.face_landmarks

            landmarks = mp_result.face_landmarks.landmark

            # Head pose from face landmarks
            head_dir, head_angle, yaw, pitch, roll = self._compute_head_pose(landmarks)
            result.head_direction = head_dir
            result.head_angle = head_angle
            result.head_yaw = yaw
            result.head_pitch = pitch
            result.head_roll = roll

            # Eye gaze from iris landmarks (pass yaw and pitch for baseline drift protection)
            gaze_dir, h_ratio, v_ratio = self._compute_gaze(landmarks, w, h, pitch, yaw)
            result.gaze_direction = gaze_dir
            result.gaze_h_ratio = h_ratio
            result.gaze_v_ratio = v_ratio

        # ── Body pose ─────────────────────────────────────────────
        if mp_result.pose_landmarks:
            result.body_detected = True
            result.pose_landmarks = mp_result.pose_landmarks
            body_leaning, body_alerts = self._analyze_body_posture(
                mp_result.pose_landmarks.landmark, w, h,
            )
            result.body_leaning = body_leaning
            result.body_alerts = body_alerts

        # ── Hands ─────────────────────────────────────────────────
        if mp_result.left_hand_landmarks:
            result.left_hand_detected = True
        if mp_result.right_hand_landmarks:
            result.right_hand_detected = True

        hand_alerts = self._analyze_hands(
            mp_result.left_hand_landmarks,
            mp_result.right_hand_landmarks,
            mp_result.pose_landmarks,
            w, h,
        )
        result.hand_alerts = hand_alerts

        # Posture is suspicious if body is leaning significantly or hands
        # are raised near the face (hiding something, using earpiece, etc.)
        result.posture_suspicious = (
            result.body_leaning != "UPRIGHT"
            or len(body_alerts) > 0
            or len(hand_alerts) > 0
        ) if result.body_detected else False

        return result

    # ── Private helpers ───────────────────────────────────────────

    def _ema(self, prev: Optional[float], curr: float) -> float:
        if prev is None:
            return curr
        return (1.0 - self.smooth_alpha) * prev + self.smooth_alpha * curr

    # --- Head pose ---

    def _compute_head_pose(
        self, landmarks,
    ) -> Tuple[str, float, float, float, float]:
        """Estimate head direction from face landmarks.

        Returns (direction_label, roll_angle, yaw, pitch, roll).
        """
        try:
            left_eye = landmarks[33]
            right_eye = landmarks[263]
            nose_tip = landmarks[1]
            chin = landmarks[152]
            forehead = landmarks[10]
        except IndexError:
            return "HEAD STRAIGHT", 0.0, 0.0, 0.0, 0.0

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

        # Dynamic center calibration
        if abs(self.smoothed_yaw - self.yaw_bias) < 0.08:
            self.yaw_bias = 0.98 * self.yaw_bias + 0.02 * self.smoothed_yaw
        if abs(self.smoothed_pitch - self.pitch_bias) < 0.08:
            self.pitch_bias = 0.98 * self.pitch_bias + 0.02 * self.smoothed_pitch

        yaw = self.smoothed_yaw - self.yaw_bias
        pitch = self.smoothed_pitch - self.pitch_bias
        roll = self.smoothed_roll

        # Direction with hysteresis
        direction = self._head_direction_hysteresis(yaw, pitch, roll)
        return direction, roll, yaw, pitch, roll

    def _head_direction_hysteresis(self, yaw: float, pitch: float, roll: float) -> str:
        d = self.last_head_direction

        # Hysteresis: exit thresholds (closer to zero = more lenient, harder to exit)
        if d == "HEAD TURN LEFT" and yaw < -0.08:
            return d
        if d == "HEAD TURN RIGHT" and yaw > 0.08:
            return d
        if d == "HEAD UP" and pitch < -0.09:  # More lenient exit for HEAD UP
            return d
        if d == "HEAD DOWN" and pitch > 0.05:  # More lenient exit for HEAD DOWN
            return d
        if d == "HEAD TILT RIGHT" and roll > 10:
            return d
        if d == "HEAD TILT LEFT" and roll < -10:
            return d

        # Entry thresholds
        # HEAD UP: easier to detect (less negative threshold)
        # HEAD DOWN: harder to detect (more positive threshold)
        if yaw < -0.08:
            self.last_head_direction = "HEAD TURN LEFT"
        elif yaw > 0.08:
            self.last_head_direction = "HEAD TURN RIGHT"
        elif pitch < -0.05:  # Made easier: was 0.02, now 0.10 (less negative = easier to trigger)
            self.last_head_direction = "HEAD UP"
        elif pitch > 0.05:  # Made harder: was 0.23, now 0.30 (more positive = harder to trigger)
            self.last_head_direction = "HEAD DOWN"
        elif roll > 18:
            self.last_head_direction = "HEAD TILT RIGHT"
        elif roll < -18:
            self.last_head_direction = "HEAD TILT LEFT"
        else:
            self.last_head_direction = "HEAD STRAIGHT"

        return self.last_head_direction

    # --- Gaze ---

    def _compute_gaze(
        self, landmarks, img_w: int, img_h: int, head_pitch: float, head_yaw: float,
    ) -> Tuple[str, float, float]:
        """Compute gaze direction from iris landmarks."""
        try:
            left_h, left_w = self._eye_h_ratio(landmarks, 33, 133, (468, 469, 470, 471, 472), img_w)
            right_h, right_w = self._eye_h_ratio(landmarks, 362, 263, (473, 474, 475, 476, 477), img_w)

            left_v, left_ht = self._eye_v_ratio(
                landmarks, (159, 160, 161), (145, 153, 154), (468, 469, 470, 471, 472), img_h,
            )
            right_v, right_ht = self._eye_v_ratio(
                landmarks, (386, 387, 388), (374, 380, 381), (473, 474, 475, 476, 477), img_h,
            )
        except (IndexError, ZeroDivisionError):
            return "LOOKING CENTER", 0.5, 0.5

        if left_w < 8.0 or right_w < 8.0:
            return "LOOKING CENTER", 0.5, 0.5

        # Horizontal
        raw_h = float(np.clip((left_h + right_h) / 2.0, 0.0, 1.0))
        self.smoothed_h_ratio = self._ema(self.smoothed_h_ratio, raw_h)

        if self.baseline_h_ratio is None:
            self.baseline_h_ratio = self.smoothed_h_ratio
        elif abs(self.smoothed_h_ratio - self.baseline_h_ratio) < 0.08:
            # Only update baseline when head is roughly straight to prevent drift
            head_is_straight = abs(head_yaw) < 0.10 and abs(head_pitch) < 0.10
            if head_is_straight:
                self.baseline_h_ratio = 0.97 * self.baseline_h_ratio + 0.03 * self.smoothed_h_ratio

        norm_h = float(np.clip(self.smoothed_h_ratio - self.baseline_h_ratio + 0.5, 0.0, 1.0))

        # Vertical
        valid_v = left_ht >= self.min_eye_height_px and right_ht >= self.min_eye_height_px
        if valid_v:
            raw_v = float(np.clip((left_v + right_v) / 2.0, 0.0, 1.0))
            self.smoothed_v_ratio = self._ema(self.smoothed_v_ratio, raw_v)
        elif self.smoothed_v_ratio is None:
            self.smoothed_v_ratio = 0.5

        if self.baseline_v_ratio is None:
            self.baseline_v_ratio = self.smoothed_v_ratio
        elif abs(self.smoothed_v_ratio - self.baseline_v_ratio) < 0.06:
            # Only update baseline when head is roughly straight to prevent drift
            head_is_straight = abs(head_yaw) < 0.10 and abs(head_pitch) < 0.10
            if head_is_straight:
                self.baseline_v_ratio = 0.98 * self.baseline_v_ratio + 0.02 * self.smoothed_v_ratio

        norm_v = float(
            np.clip(
                ((self.smoothed_v_ratio - self.baseline_v_ratio) * self.vertical_gain) + 0.5,
                0.0, 1.0,
            )
        )

        # Pitch suppression
        if head_pitch is not None:
            pitch_mag = abs(float(head_pitch))
            suppression = float(np.clip((pitch_mag - 0.06) / 0.18, 0.0, 1.0))
            norm_v = 0.5 + ((norm_v - 0.5) * (1.0 - suppression))

        # Direction with hysteresis
        direction = self._gaze_direction_hysteresis(norm_h, norm_v, head_pitch)
        return direction, norm_h, norm_v

    def _gaze_direction_hysteresis(self, norm_h: float, norm_v: float, head_pitch) -> str:
        # Thresholds: enter = further from center, exit = closer to center.
        # Horizontal: more sensitive for better left/right detection
        h_enter_left  = 0.45   # must drop below this to enter LOOKING LEFT
        h_exit_left   = 0.49   # must rise above this to leave LOOKING LEFT (more lenient)
        h_enter_right = 0.55   # must rise above this to enter LOOKING RIGHT
        h_exit_right  = 0.51   # must drop below this to leave LOOKING RIGHT (more lenient)
        # Vertical thresholds (with hysteresis), intentionally conservative
        # to avoid persistent false "LOOKING UP" labels in webcam setups.
        v_enter_up    = 0.34   # must drop below this to enter LOOKING UP
        v_exit_up     = 0.42   # must rise above this to leave LOOKING UP
        v_enter_down  = 0.66   # must rise above this to enter LOOKING DOWN
        v_exit_down   = 0.58   # must drop below this to leave LOOKING DOWN

        d = self.last_gaze_direction
        pitch_block_vertical = (
            head_pitch is not None and abs(float(head_pitch)) >= 0.14
        )

        # Hysteresis: stay in current direction only while value is STILL
        # beyond the exit threshold (i.e. hasn't returned toward center).
        if d == "LOOKING LEFT" and norm_h < h_exit_left:
            return d
        if d == "LOOKING RIGHT" and norm_h > h_exit_right:
            return d
        if d == "LOOKING UP" and (not pitch_block_vertical) and norm_v < v_exit_up:
            return d
        if d == "LOOKING DOWN" and (not pitch_block_vertical) and norm_v > v_exit_down:
            return d

        # Entry checks
        if norm_h < h_enter_left:
            self.last_gaze_direction = "LOOKING LEFT"
        elif norm_h > h_enter_right:
            self.last_gaze_direction = "LOOKING RIGHT"
        elif (not pitch_block_vertical) and norm_v < v_enter_up:
            self.last_gaze_direction = "LOOKING UP"
        elif (not pitch_block_vertical) and norm_v > v_enter_down:
            self.last_gaze_direction = "LOOKING DOWN"
        else:
            self.last_gaze_direction = "LOOKING CENTER"

        return self.last_gaze_direction

    def _eye_h_ratio(self, landmarks, left_idx, right_idx, iris_indices, img_w):
        x_left = float(landmarks[left_idx].x * img_w)
        x_right = float(landmarks[right_idx].x * img_w)
        iris_x = float(np.mean([float(landmarks[i].x * img_w) for i in iris_indices]))
        width = max(1.0, abs(x_right - x_left))
        ratio = (iris_x - x_left) / width if x_right >= x_left else (x_left - iris_x) / width
        return float(np.clip(ratio, 0.0, 1.0)), width

    def _eye_v_ratio(self, landmarks, upper_indices, lower_indices, iris_indices, img_h):
        y_upper = float(np.mean([float(landmarks[i].y * img_h) for i in upper_indices]))
        y_lower = float(np.mean([float(landmarks[i].y * img_h) for i in lower_indices]))
        iris_y = float(np.mean([float(landmarks[i].y * img_h) for i in iris_indices]))
        height = max(1.0, abs(y_lower - y_upper))
        ratio = (iris_y - y_upper) / height
        return float(np.clip(ratio, 0.0, 1.0)), float(height)

    # --- Body posture ---

    def _analyze_body_posture(
        self, pose_landmarks, img_w: int, img_h: int,
    ) -> Tuple[str, List[str]]:
        """Detect suspicious body posture from pose landmarks."""
        alerts: List[str] = []
        leaning = "UPRIGHT"

        try:
            left_shoulder = pose_landmarks[11]
            right_shoulder = pose_landmarks[12]
            nose = pose_landmarks[0]

            # Shoulder midpoint
            shoulder_mid_x = (left_shoulder.x + right_shoulder.x) / 2.0
            shoulder_mid_y = (left_shoulder.y + right_shoulder.y) / 2.0

            # Shoulder tilt (significant tilt means leaning)
            shoulder_dx = right_shoulder.x - left_shoulder.x
            shoulder_dy = right_shoulder.y - left_shoulder.y
            shoulder_tilt = math.degrees(math.atan2(shoulder_dy, shoulder_dx))

            if shoulder_tilt > 12:
                leaning = "LEANING RIGHT"
                alerts.append("BODY_LEANING_RIGHT")
            elif shoulder_tilt < -12:
                leaning = "LEANING LEFT"
                alerts.append("BODY_LEANING_LEFT")

            # Nose far below shoulder line = looking down at something (desk, phone)
            nose_below = nose.y - shoulder_mid_y
            if nose_below > 0.15:
                leaning = "LEANING FORWARD"
                alerts.append("LOOKING_DOWN_AT_DESK")

            # Nose far to one side = turning body to look at something
            nose_offset_x = abs(nose.x - shoulder_mid_x)
            if nose_offset_x > 0.12:
                alerts.append("BODY_TURNED_SIDEWAYS")

        except (IndexError, AttributeError):
            pass

        return leaning, alerts

    # --- Hands ---

    def _analyze_hands(
        self,
        left_hand,
        right_hand,
        pose_landmarks,
        img_w: int,
        img_h: int,
    ) -> List[str]:
        """Detect suspicious hand positions."""
        alerts: List[str] = []

        if not pose_landmarks:
            return alerts

        try:
            nose = pose_landmarks.landmark[0]
            left_ear = pose_landmarks.landmark[7]
            right_ear = pose_landmarks.landmark[8]
        except (IndexError, AttributeError):
            return alerts

        # Check if hands are near the ear (earpiece / phone call)
        for hand_data, hand_name in [(left_hand, "LEFT"), (right_hand, "RIGHT")]:
            if hand_data is None:
                continue

            try:
                wrist = hand_data.landmark[0]
                # Hand near ear
                ear = left_ear if hand_name == "LEFT" else right_ear
                dist_to_ear = math.sqrt(
                    (wrist.x - ear.x) ** 2 + (wrist.y - ear.y) ** 2
                )
                if dist_to_ear < 0.08:
                    alerts.append(f"{hand_name}_HAND_NEAR_EAR")

                # Hand raised above nose (hiding face / holding phone up)
                if wrist.y < nose.y - 0.05:
                    alerts.append(f"{hand_name}_HAND_RAISED")

            except (IndexError, AttributeError):
                continue

        return alerts
