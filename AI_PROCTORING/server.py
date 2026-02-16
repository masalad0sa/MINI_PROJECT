import base64
import os
import sys
import threading
import time
from typing import Dict, Optional

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add current directory to path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from modules.behavior import BehaviorAnalyzer
from modules.eye_gaze import EyeGazeTracker
from modules.face_detection import FaceDetector
from modules.face_mesh import FaceMeshDetector
from modules.head_pose import HeadPoseEstimator
from modules.object_detector import ObjectDetector

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Initializing AI Models...")
face_detector = FaceDetector()
mesh_detector = FaceMeshDetector()
object_detector = ObjectDetector()
print("Models Initialized!")


STATE_TTL_SECONDS = 30 * 60
VIOLATION_COOLDOWN_SECONDS = 8
NO_FACE_STREAK_FOR_HIGH = 5
MULTI_FACE_STREAK_FOR_HIGH = 2
OBJECT_STREAK_FOR_HIGH = 2
OBJECT_IMMEDIATE_CONFIDENCE = 0.72


class FrameData(BaseModel):
    image: str
    session_id: Optional[str] = None
    exam_id: Optional[str] = None


class SessionState:
    def __init__(self):
        self.behavior_analyzer = BehaviorAnalyzer()
        self.gaze_tracker = EyeGazeTracker()
        self.head_pose = HeadPoseEstimator()
        self.no_face_streak = 0
        self.detector_only_streak = 0
        self.multi_face_streak = 0
        self.object_streaks: Dict[str, int] = {}
        self.frame_count = 0
        self.last_violation_type: Optional[str] = None
        self.last_violation_at = 0.0
        self.last_updated = time.time()


SESSION_STATES: Dict[str, SessionState] = {}
STATE_LOCK = threading.Lock()


def _build_session_key(payload: FrameData):
    if payload.session_id and payload.session_id.strip():
        return f"session:{payload.session_id.strip()}"
    if payload.exam_id and payload.exam_id.strip():
        return f"exam:{payload.exam_id.strip()}"
    return "anonymous"


def _get_session_state(session_key: str):
    now = time.time()
    with STATE_LOCK:
        stale_keys = [
            key
            for key, value in SESSION_STATES.items()
            if now - value.last_updated > STATE_TTL_SECONDS
        ]
        for stale_key in stale_keys:
            del SESSION_STATES[stale_key]

        state = SESSION_STATES.get(session_key)
        if state is None:
            state = SessionState()
            SESSION_STATES[session_key] = state

        state.last_updated = now
        return state


def _decode_frame(image_data: str):
    if not image_data:
        raise HTTPException(status_code=400, detail="No image data")

    encoded = image_data.split(",", 1)[1] if "," in image_data else image_data
    try:
        image_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Failed to decode image: {error}")

    if frame is None:
        raise HTTPException(status_code=400, detail="Failed to decode image")

    return frame


def _update_object_streaks(state: SessionState, detected_objects):
    current = set(detected_objects)

    for label in list(state.object_streaks.keys()):
        if label in current:
            continue
        state.object_streaks[label] = max(0, state.object_streaks[label] - 1)
        if state.object_streaks[label] == 0:
            del state.object_streaks[label]

    for label in current:
        state.object_streaks[label] = state.object_streaks.get(label, 0) + 1

    return sorted(
        [
            label
            for label, streak in state.object_streaks.items()
            if streak >= OBJECT_STREAK_FOR_HIGH
        ]
    )


def _should_log_violation(state: SessionState, violation_type: Optional[str]):
    if not violation_type:
        return False

    now = time.time()
    if (
        state.last_violation_type == violation_type
        and now - state.last_violation_at < VIOLATION_COOLDOWN_SECONDS
    ):
        return False

    state.last_violation_type = violation_type
    state.last_violation_at = now
    return True


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ai-proctoring",
        "sessions_active": len(SESSION_STATES),
    }


@app.post("/process_frame")
async def process_frame(data: FrameData):
    try:
        frame = _decode_frame(data.image)
        h, w, _ = frame.shape

        session_key = _build_session_key(data)
        state = _get_session_state(session_key)
        state.frame_count += 1

        # 1. Face detection + mesh cross-check.
        frame, detector_face_count = face_detector.detect_faces(frame)
        mesh_results = mesh_detector.process(frame)
        mesh_face_count = (
            len(mesh_results.multi_face_landmarks)
            if mesh_results and mesh_results.multi_face_landmarks
            else 0
        )

        if detector_face_count == 0 and mesh_face_count == 0:
            state.no_face_streak += 1
            state.detector_only_streak = 0
            effective_face_count = 0
        elif detector_face_count == 1 and mesh_face_count == 0:
            # Detector-only single-face frames are uncertain; track separately.
            state.no_face_streak = 0
            state.detector_only_streak += 1
            effective_face_count = 1
        else:
            state.no_face_streak = 0
            state.detector_only_streak = 0
            effective_face_count = max(detector_face_count, mesh_face_count)

        if effective_face_count > 1:
            state.multi_face_streak += 1
        else:
            state.multi_face_streak = max(0, state.multi_face_streak - 1)

        # 2. Object detection with persistence + high-confidence shortcut.
        object_result = object_detector.detect(frame, with_metadata=True)
        raw_objects = object_result.get("labels", [])
        object_scores = object_result.get("scores", {})
        object_detections = object_result.get("detections", [])
        confirmed_objects = _update_object_streaks(state, raw_objects)
        high_confidence_objects = sorted(
            [
                label
                for label, confidence in object_scores.items()
                if float(confidence) >= OBJECT_IMMEDIATE_CONFIDENCE
            ]
        )
        active_object_alerts = sorted(set(confirmed_objects + high_confidence_objects))
        prohibited_object_detected = len(active_object_alerts) > 0

        # 3. Gaze/head behavior.
        gaze_dir = "LOOKING CENTER"
        head_dir = "HEAD STRAIGHT"
        head_angle = 0.0
        score = int(round(state.behavior_analyzer.suspicion_score))

        if mesh_face_count > 0 and mesh_results.multi_face_landmarks:
            landmarks = mesh_results.multi_face_landmarks[0].landmark
            gaze_dir = state.gaze_tracker.get_gaze_direction(landmarks, w, h)
            head_dir, head_angle = state.head_pose.estimate(landmarks)
            score = state.behavior_analyzer.analyze(gaze_dir, head_dir)
        else:
            # Mild decay while no mesh landmarks are available.
            score = state.behavior_analyzer.reduce_penalty(1.0)
            if state.no_face_streak >= 3:
                state.gaze_tracker.reset()
                state.head_pose.reset()

        # 4. Risk composition from multiple signals.
        if state.no_face_streak >= 2:
            # Penalize only after sustained absence to avoid transient misses.
            no_face_penalty = min(65, 8 + state.no_face_streak * 8)
            score = max(score, no_face_penalty)
        if state.multi_face_streak > 0:
            multi_face_penalty = min(90, 30 + state.multi_face_streak * 15)
            score = max(score, multi_face_penalty)
        if prohibited_object_detected:
            score = max(score, 90)

        score = int(max(0, min(100, score)))

        violation_type = None
        if prohibited_object_detected:
            violation_type = "PROHIBITED_OBJECT"
        elif state.multi_face_streak >= MULTI_FACE_STREAK_FOR_HIGH:
            violation_type = "MULTIPLE_FACES"
        elif state.no_face_streak >= NO_FACE_STREAK_FOR_HIGH:
            violation_type = "NO_FACE"
        elif score >= 70:
            violation_type = "HIGH_SUSPICION"

        if violation_type:
            risk_level = "HIGH"
            risk_color = (0, 0, 255)
        elif score >= 45:
            risk_level = "MEDIUM"
            risk_color = (0, 255, 255)
        else:
            risk_level = "LOW"
            risk_color = (0, 255, 0)

        should_log_violation = _should_log_violation(state, violation_type)

        cv2.putText(
            frame,
            f"Gaze: {gaze_dir}",
            (20, 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
        )
        cv2.putText(
            frame,
            f"Head: {head_dir}",
            (20, 65),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
        )
        cv2.putText(
            frame,
            f"Score: {score}",
            (20, 95),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 0, 255),
            2,
        )
        cv2.putText(
            frame,
            f"Risk: {risk_level}",
            (20, 125),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            risk_color,
            2,
        )
        cv2.putText(
            frame,
            f"Faces D/M/E: {detector_face_count}/{mesh_face_count}/{effective_face_count}",
            (20, 155),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 0),
            2,
        )
        if violation_type:
            cv2.putText(
                frame,
                violation_type,
                (20, 185),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 0, 255),
                2,
            )
        if active_object_alerts:
            cv2.putText(
                frame,
                f"OBJECT: {', '.join(active_object_alerts)}",
                (20, 215),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (0, 0, 255),
                2,
            )

        _, buffer = cv2.imencode(".jpg", frame)
        processed_image_b64 = base64.b64encode(buffer).decode("utf-8")

        return {
            "success": True,
            "face_count": int(effective_face_count),
            "raw_face_count": int(detector_face_count),
            "mesh_face_count": int(mesh_face_count),
            "objects": active_object_alerts,
            "confirmed_objects": confirmed_objects,
            "raw_objects": raw_objects,
            "high_confidence_objects": high_confidence_objects,
            "object_scores": object_scores,
            "object_detections": object_detections,
            "suspicion_score": score,
            "risk_level": risk_level,
            "violation_type": violation_type,
            "should_log_violation": should_log_violation,
            "no_face_streak": int(state.no_face_streak),
            "detector_only_streak": int(state.detector_only_streak),
            "multi_face_streak": int(state.multi_face_streak),
            "gaze_direction": gaze_dir,
            "gaze_ratio_raw": float(state.gaze_tracker.last_raw_ratio),
            "gaze_ratio": float(state.gaze_tracker.last_normalized_ratio),
            "head_direction": head_dir,
            "head_angle": float(head_angle),
            "head_yaw": float(state.head_pose.last_metrics.get("yaw", 0.0)),
            "head_pitch": float(state.head_pose.last_metrics.get("pitch", 0.0)),
            "head_roll": float(state.head_pose.last_metrics.get("roll", 0.0)),
            "processed_image": f"data:image/jpeg;base64,{processed_image_b64}",
        }
    except HTTPException:
        raise
    except Exception as error:
        print(f"Error processing frame: {error}")
        raise HTTPException(status_code=500, detail=str(error))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
