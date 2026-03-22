import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


class MLModel:
    """Optional shadow ML model loader.

    Inspired by the miniproject `modules/ml_model.py`, adapted to:
    - support bundled model metadata (`{"model": ..., "feature_names": ...}`)
    - run safely when optional deps are missing
    - avoid affecting primary rule-based scoring
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model = None
        self.model_path = (
            Path(model_path)
            if model_path
            else (Path(__file__).resolve().parent.parent / "model.pkl")
        )
        self.feature_names: List[str] = [
            "angle",
            "face_count",
            "phone_detected",
        ]
        self.load_error: Optional[str] = None
        self._load_model()

    @property
    def is_loaded(self) -> bool:
        return self.model is not None

    def _load_model(self) -> None:
        if not self.model_path.exists():
            self.load_error = f"Model file not found: {self.model_path}"
            return

        try:
            import joblib
        except Exception as exc:
            self.load_error = f"joblib unavailable: {exc}"
            return

        try:
            loaded = joblib.load(self.model_path)
        except Exception as exc:
            self.load_error = f"Failed to load model: {exc}"
            return

        if isinstance(loaded, dict) and "model" in loaded:
            self.model = loaded.get("model")
            loaded_features = loaded.get("feature_names")
            if isinstance(loaded_features, list) and loaded_features:
                self.feature_names = [str(name) for name in loaded_features]
        else:
            self.model = loaded

    @staticmethod
    def _normalize_prediction(prediction: Any) -> Tuple[int, str]:
        if isinstance(prediction, str):
            normalized = prediction.strip().upper()
            mapping = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
            if normalized in mapping:
                return mapping[normalized], normalized

        try:
            label_index = int(prediction)
        except Exception:
            label_index = 0

        label_map = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
        return label_index, label_map.get(label_index, "LOW")

    def _build_feature_row(
        self,
        *,
        angle: Any,
        face_count: Any,
        phone_detected: Any,
        multi_face: Any = 0,
        suspicion_score: Any = 0,
        gaze_h_ratio: Any = 0.5,
        gaze_v_ratio: Any = 0.5,
        head_yaw: Any = 0.0,
        head_pitch: Any = 0.0,
    ) -> Dict[str, float]:
        return {
            "angle": _as_float(angle),
            "face_count": _as_float(face_count),
            "phone_detected": float(_as_int(phone_detected)),
            "multi_face": float(_as_int(multi_face)),
            "suspicion_score": _as_float(suspicion_score),
            "gaze_h_ratio": _as_float(gaze_h_ratio, default=0.5),
            "gaze_v_ratio": _as_float(gaze_v_ratio, default=0.5),
            "head_yaw": _as_float(head_yaw),
            "head_pitch": _as_float(head_pitch),
        }

    def predict(
        self,
        *,
        angle: Any,
        face_count: Any,
        phone_detected: Any,
        multi_face: Any = 0,
        suspicion_score: Any = 0,
        gaze_h_ratio: Any = 0.5,
        gaze_v_ratio: Any = 0.5,
        head_yaw: Any = 0.0,
        head_pitch: Any = 0.0,
    ) -> Optional[Dict[str, Any]]:
        if not self.model:
            return None

        feature_map = self._build_feature_row(
            angle=angle,
            face_count=face_count,
            phone_detected=phone_detected,
            multi_face=multi_face,
            suspicion_score=suspicion_score,
            gaze_h_ratio=gaze_h_ratio,
            gaze_v_ratio=gaze_v_ratio,
            head_yaw=head_yaw,
            head_pitch=head_pitch,
        )

        ordered_values = [feature_map.get(name, 0.0) for name in self.feature_names]

        # Use pandas when available (for sklearn models trained with feature names).
        try:
            import pandas as pd  # Optional dependency

            features = pd.DataFrame([ordered_values], columns=self.feature_names)
        except Exception:
            features = [ordered_values]

        try:
            raw_prediction = self.model.predict(features)[0]
            label_index, risk_level = self._normalize_prediction(raw_prediction)
        except Exception as exc:
            return {
                "available": False,
                "error": f"Prediction failed: {exc}",
            }

        confidence = None
        try:
            if hasattr(self.model, "predict_proba"):
                probabilities = self.model.predict_proba(features)[0]
                confidence = float(max(probabilities))
        except Exception:
            confidence = None

        return {
            "available": True,
            "model_loaded": True,
            "prediction_index": int(label_index),
            "prediction_risk": risk_level,
            "confidence": confidence,
            "feature_names": self.feature_names,
        }
