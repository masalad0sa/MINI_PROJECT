"""Train optional shadow ML model from exam logs.

This script is adapted from the legacy miniproject training workflow and
extended to work with the current `exam_log.csv` schema.
"""

import ast
import os
from pathlib import Path
from typing import List


def _parse_detected_objects(raw_value) -> str:
    if raw_value is None:
        return ""

    text = str(raw_value).strip()
    if not text:
        return ""

    # Support list-like strings stored in CSV, e.g. "['cell phone']"
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = ast.literal_eval(text)
            if isinstance(parsed, list):
                return ",".join(str(item) for item in parsed).lower()
        except Exception:
            pass

    return text.lower()


def _require_optional_deps():
    try:
        import joblib  # noqa: F401
        import pandas as pd  # noqa: F401
        from sklearn.ensemble import RandomForestClassifier  # noqa: F401
        from sklearn.metrics import accuracy_score, classification_report  # noqa: F401
        from sklearn.model_selection import GridSearchCV, train_test_split  # noqa: F401
    except Exception as exc:
        raise RuntimeError(
            "Missing optional ML dependencies. Install: "
            "pandas scikit-learn joblib"
        ) from exc


def _normalize_columns(data):
    data.columns = [
        str(column).strip().lower().replace(" ", "_")
        for column in data.columns
    ]
    return data


def _load_exam_log(input_path):
    import pandas as pd

    expected_min_columns = [
        "timestamp",
        "gaze",
        "head",
        "angle",
        "face_count",
        "multi_face",
        "suspicion_score",
        "risk_level",
    ]
    full_columns = expected_min_columns + ["detected_objects"]

    # First try standard CSV with header row.
    data = pd.read_csv(input_path)
    data = _normalize_columns(data)

    has_required = {"angle", "face_count", "risk_level"}.issubset(set(data.columns))
    if has_required:
        return data

    # Fallback: headerless CSV (legacy logs often start directly with data rows).
    data_no_header = pd.read_csv(input_path, header=None)

    if data_no_header.shape[1] < len(expected_min_columns):
        raise ValueError(
            "Could not parse exam_log.csv. Expected at least 8 columns "
            "(timestamp,gaze,head,angle,face_count,multi_face,suspicion_score,risk_level)."
        )

    # Assign canonical names to leading columns and preserve extras.
    column_names = []
    for idx in range(data_no_header.shape[1]):
        if idx < len(full_columns):
            column_names.append(full_columns[idx])
        else:
            column_names.append(f"extra_{idx}")

    data_no_header.columns = column_names
    data_no_header = _normalize_columns(data_no_header)

    return data_no_header


def main():
    _require_optional_deps()

    import joblib
    import pandas as pd
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import accuracy_score, classification_report
    from sklearn.model_selection import GridSearchCV, train_test_split

    base_dir = Path(__file__).resolve().parent
    input_path = base_dir / "exam_log.csv"
    output_path = base_dir / "model.pkl"

    if not input_path.exists():
        raise FileNotFoundError(f"Log file not found: {input_path}")

    data = _load_exam_log(input_path)
    if data.empty:
        raise ValueError("exam_log.csv is empty. Collect data before training.")

    required_columns = {"angle", "face_count", "risk_level"}
    missing = required_columns - set(data.columns)
    if missing:
        raise ValueError(f"Missing required columns in log: {sorted(missing)}")

    # Normalize label
    label_map = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
    data["risk_level"] = data["risk_level"].astype(str).str.upper().str.strip()
    data = data[data["risk_level"].isin(label_map.keys())].copy()
    if data.empty:
        raise ValueError("No valid LOW/MEDIUM/HIGH labels found in risk_level column.")
    data["label"] = data["risk_level"].map(label_map).astype(int)

    # Legacy-compatible core features
    data["angle"] = pd.to_numeric(data["angle"], errors="coerce").fillna(0.0)
    data["face_count"] = pd.to_numeric(data["face_count"], errors="coerce").fillna(0.0)

    detected_col = (
        data["detected_objects"]
        if "detected_objects" in data.columns
        else pd.Series([""] * len(data))
    )
    detected_text = detected_col.apply(_parse_detected_objects)

    data["phone_detected"] = detected_text.str.contains("phone").astype(int)

    # Extra features available in the current schema (safe fallbacks)
    data["multi_face"] = (
        pd.to_numeric(data["multi_face"], errors="coerce").fillna(0).astype(int)
        if "multi_face" in data.columns
        else (data["face_count"] > 1).astype(int)
    )
    data["suspicion_score"] = (
        pd.to_numeric(data["suspicion_score"], errors="coerce").fillna(0.0)
        if "suspicion_score" in data.columns
        else 0.0
    )
    data["object_detected"] = detected_text.str.len().gt(0).astype(int)
    data["gaze_abnormal"] = (
        data["gaze"].astype(str).str.upper().str.strip().ne("LOOKING CENTER").astype(int)
        if "gaze" in data.columns
        else 0
    )
    data["head_abnormal"] = (
        data["head"].astype(str).str.upper().str.strip().ne("HEAD STRAIGHT").astype(int)
        if "head" in data.columns
        else 0
    )

    feature_names: List[str] = [
        "angle",
        "face_count",
        "phone_detected",
        "multi_face",
        "suspicion_score",
        "object_detected",
        "gaze_abnormal",
        "head_abnormal",
    ]

    X = data[feature_names]
    y = data["label"]

    if len(data) < 20:
        print("[train_model] Warning: very small dataset; model quality may be poor.")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y if y.nunique() > 1 else None,
    )

    param_grid = {
        "n_estimators": [100, 200],
        "max_depth": [None, 12, 20],
        "class_weight": ["balanced", None],
    }
    grid_n_jobs = int(os.getenv("AI_TRAIN_N_JOBS", "1"))
    grid_verbose = int(os.getenv("AI_TRAIN_VERBOSE", "1"))

    base_model = RandomForestClassifier(random_state=42)
    grid_search = GridSearchCV(
        estimator=base_model,
        param_grid=param_grid,
        cv=3,
        n_jobs=grid_n_jobs,
        verbose=grid_verbose,
    )
    grid_search.fit(X_train, y_train)
    best_model = grid_search.best_estimator_

    y_pred = best_model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"[train_model] Validation accuracy: {accuracy * 100:.2f}%")
    print("[train_model] Classification report:")
    print(classification_report(y_test, y_pred))
    print(f"[train_model] Best params: {grid_search.best_params_}")

    # Refit on full data for deployment
    best_model.fit(X, y)

    model_bundle = {
        "model": best_model,
        "feature_names": feature_names,
        "label_map": label_map,
        "trained_rows": int(len(data)),
    }
    joblib.dump(model_bundle, output_path)
    print(f"[train_model] Saved model bundle to: {output_path}")


if __name__ == "__main__":
    main()
