# Miniproject Folder Review Notes

Reviewed source folder:

- `D:\projects\Enhance-Exam-Proctoring\main\miniproject\ai_proctoring`

Review date:

- March 22, 2026

## What Is Reusable

- `train_model.py` and `modules/ml_model.py` are useful as a reference for a future ML-based risk scorer workflow.
- `modules/object_detector.py` shows a minimal YOLO usage pattern that can be used as a lightweight fallback mode idea.
- `modules/logger.py` confirms the basic CSV schema pattern (`gaze`, `head`, `face_count`, `risk`) that still maps to current reporting needs.

## What Should Not Be Imported Directly

- `modules/eye_gaze.py` is empty (`0` bytes), so it has no reusable implementation.
- `main.py` is a standalone webcam loop and does not fit the current API architecture (`backend` + `AI_PROCTORING/server.py`).
- `modules/head_pose.py` is very simplified (eye-line tilt only) compared to current yaw/pitch approach.
- `modules/face_detection.py` is basic and lacks the stronger filtering used in the current detector.
- `modules/behavior.py` is much simpler than the current behavior analyzer and may increase false positives if copied.

## Recommended Next-Step Experiments (Idea Only)

- Train a model with richer features from current logs:
- Features: `gaze_h_ratio`, `gaze_v_ratio`, `head_yaw`, `head_pitch`, `face_count`, object flags, abnormal duration.
- Labeling: use validated violation outcomes, not raw risk text alone.
- Evaluation: prioritize precision and false-positive rate, not only accuracy.
- Deploy strategy: shadow mode first, compare ML score vs current rule-based score before enabling decisions.

## Decision

- Keep this miniproject folder as historical reference only.
- Do not merge its runtime modules into the current production pipeline.
