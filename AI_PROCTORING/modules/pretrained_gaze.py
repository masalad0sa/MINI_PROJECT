import os
from collections import deque
from pathlib import Path

import numpy as np


class PretrainedGazeEstimator:
    """Optional pretrained gaze backend with safe runtime fallback.

    The estimator never raises hard errors to callers. If a backend is not
    available, predict() returns (None, 0.0, "unavailable").
    """

    def __init__(self, provider="auto"):
        self.provider = str(provider or "auto").lower()
        self.backend = None
        self.backend_name = "none"
        self.last_error = None

        self._l2cs_pipeline = None
        self._init_backend()

    @property
    def available(self):
        return self.backend is not None

    def _init_backend(self):
        # Try L2CS only (ptgaze not stable for Python API)
        try:
            if self._try_init_l2cs():
                self.backend = self._predict_l2cs
                self.backend_name = "l2cs"
                print(f"[Gaze] L2CS backend loaded successfully")
                return
        except Exception as error:
            self.last_error = str(error)
            print(f"[Gaze] Failed to init l2cs: {error}")

        self.backend = None
        self.backend_name = "none"
        print(f"[Gaze] No pretrained backend available. Last error: {self.last_error}")
        print(f"[Gaze] Falling back to iris-ratio gaze tracker only.")

    def _try_init_l2cs(self):
        try:
            from l2cs import Pipeline  # type: ignore
            import torch  # type: ignore
        except ImportError as error:
            self.last_error = (
                f"l2cs/torch not installed: {error}. "
                f"Install with: pip install l2cs-net torch torchvision"
            )
            print(f"[Gaze] {self.last_error}")
            return False
        except Exception as error:
            self.last_error = str(error)
            print(f"[Gaze] Unexpected error importing l2cs: {error}")
            return False

        device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        kwargs = {"device": device}

        arch = os.getenv("GAZE_L2CS_ARCH", "ResNet50").strip()
        if arch:
            kwargs["arch"] = arch

        weights = os.getenv("GAZE_L2CS_WEIGHTS", "").strip()
        weights_path = None
        if weights:
            candidate = Path(weights).expanduser()
            if not candidate.is_absolute():
                candidate = (Path.cwd() / candidate).resolve()
            if candidate.exists():
                weights_path = candidate

        if weights_path is None:
            search_paths = [
                (Path.cwd() / "models" / "L2CSNet_gaze360.pkl").resolve(),
                (Path.cwd() / "models" / "Gaze360" / "L2CSNet_gaze360.pkl").resolve(),
            ]
            for candidate in search_paths:
                if candidate.exists():
                    weights_path = candidate
                    break

        if weights_path is None:
            searched = [str(p) for p in search_paths]
            self.last_error = (
                f"L2CS weights not found in {len(searched)} locations. "
                f"Set GAZE_L2CS_WEIGHTS or place L2CSNet_gaze360.pkl in "
                f"AI_PROCTORING/models/ or AI_PROCTORING/models/Gaze360/"
            )
            print(f"[Gaze] {self.last_error}")
            print(f"[Gaze] Searched: {searched[:4]}...")
            return False

        kwargs["weights"] = weights_path

        try:
            print(f"[Gaze] Loading L2CS pipeline from {weights_path} (arch={kwargs.get('arch', 'default')})")
            self._l2cs_pipeline = Pipeline(**kwargs)
            print(f"[Gaze] L2CS pipeline loaded successfully")
            return True
        except Exception as error:
            self.last_error = f"L2CS Pipeline init failed: {error}"
            print(f"[Gaze] {self.last_error}")
            return False

    def predict(self, frame_bgr, head_pitch=None):
        if self.backend is None or frame_bgr is None:
            return None, 0.0, "unavailable"

        try:
            label, confidence = self.backend(frame_bgr)
        except Exception as error:
            self.last_error = str(error)
            return None, 0.0, "error"

        if label in {"LOOKING UP", "LOOKING DOWN"} and head_pitch is not None:
            # If head pitch is large, down-weight vertical eye predictions.
            pitch_mag = abs(float(head_pitch))
            if pitch_mag >= 0.18:
                return "LOOKING CENTER", float(confidence) * 0.2, self.backend_name
            if pitch_mag >= 0.10:
                damp = float(np.clip((pitch_mag - 0.10) / 0.08, 0.0, 1.0))
                confidence = float(confidence) * (1.0 - 0.5 * damp)

        return label, float(np.clip(confidence, 0.0, 1.0)), self.backend_name

    def _extract_scalar(self, value):
        if value is None:
            return None

        if hasattr(value, "detach"):
            value = value.detach().cpu().numpy()

        if isinstance(value, (list, tuple)):
            if not value:
                return None
            value = value[0]

        if hasattr(value, "shape"):
            arr = np.array(value).reshape(-1)
            if arr.size == 0:
                return None
            return float(arr[0])

        try:
            return float(value)
        except Exception:
            return None

    def _predict_l2cs(self, frame_bgr):
        if self._l2cs_pipeline is None:
            return None, 0.0

        result = self._l2cs_pipeline.step(frame_bgr)
        if result is None:
            return None, 0.0

        pitch = self._extract_scalar(getattr(result, "pitch", None))
        yaw = self._extract_scalar(getattr(result, "yaw", None))
        if pitch is None or yaw is None:
            return None, 0.0

        # L2CS outputs radians. Thresholds are deliberately conservative.
        yaw_left = -0.22
        yaw_right = 0.22
        pitch_up = -0.17
        pitch_down = 0.17

        if yaw < yaw_left:
            label = "LOOKING LEFT"
        elif yaw > yaw_right:
            label = "LOOKING RIGHT"
        elif pitch < pitch_up:
            label = "LOOKING UP"
        elif pitch > pitch_down:
            label = "LOOKING DOWN"
        else:
            label = "LOOKING CENTER"

        # Some builds expose confidence vectors, others do not.
        confidence = self._extract_scalar(getattr(result, "confidence", None))
        if confidence is None:
            confidence = 0.7 if label != "LOOKING CENTER" else 0.6
        return label, float(np.clip(confidence, 0.0, 1.0))


class GazeFusion:
    """Fuse pretrained gaze with legacy landmark-based gaze.

    Rules:
    - Use pretrained label only when confidence threshold is met.
    - Apply short temporal smoothing to reduce jitter.
    - Fallback to legacy output otherwise.
    """

    def __init__(self, min_confidence=0.62, window_size=5, stable_count=3):
        self.min_confidence = float(np.clip(min_confidence, 0.05, 0.99))
        self.window_size = int(max(3, window_size))
        self.stable_count = int(max(2, stable_count))
        self.history = deque(maxlen=self.window_size)
        self.last_output = "LOOKING CENTER"

    def reset(self):
        self.history.clear()
        self.last_output = "LOOKING CENTER"

    def _smoothed_model_label(self):
        if not self.history:
            return None, 0.0

        labels = [item[0] for item in self.history]
        confs = [item[1] for item in self.history]

        if len(labels) < self.stable_count:
            return None, float(np.mean(confs))

        tail = labels[-self.stable_count :]
        if len(set(tail)) == 1:
            tail_conf = confs[-self.stable_count :]
            return tail[0], float(np.mean(tail_conf))

        return None, float(np.mean(confs))

    def resolve(self, legacy_label, model_label, model_confidence, head_pitch=None):
        confidence = float(np.clip(model_confidence or 0.0, 0.0, 1.0))

        if model_label and confidence >= self.min_confidence:
            self.history.append((model_label, confidence))
        else:
            self.history.append((legacy_label, max(0.35, confidence)))

        smoothed_label, smoothed_conf = self._smoothed_model_label()

        if smoothed_label and smoothed_conf >= self.min_confidence:
            # Extra guard against pitch-induced vertical mistakes.
            if (
                head_pitch is not None
                and abs(float(head_pitch)) >= 0.18
                and smoothed_label in {"LOOKING UP", "LOOKING DOWN"}
            ):
                self.last_output = legacy_label
                return legacy_label, "legacy(pitch_guard)", float(smoothed_conf)

            self.last_output = smoothed_label
            return smoothed_label, "pretrained", float(smoothed_conf)

        self.last_output = legacy_label
        return legacy_label, "legacy", confidence
