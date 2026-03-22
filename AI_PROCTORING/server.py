import base64
import os
import statistics
import sys
import threading
import time
from datetime import datetime
from typing import Dict, Optional

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add current directory to path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from modules.behavior import BehaviorAnalyzer
from modules.eye_gaze import EyeGazeTracker
from modules.face_detection import FaceDetector
from modules.face_mesh import FaceMeshDetector
from modules.head_pose import HeadPoseEstimator
from modules.holistic_detector import HolisticDetector
from modules.object_detector import ObjectDetector
from modules.pretrained_gaze import GazeFusion, PretrainedGazeEstimator
from modules.logger import ExamLogger

app = FastAPI()

# Only accept requests from the Node backend by default.
# Override with AI_ALLOWED_ORIGINS="https://api.example.com,https://..."
# when deploying behind non-localhost hosts.
_DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
]
_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("AI_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
] or _DEFAULT_ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Initializing AI Models...")
face_detector = FaceDetector()
object_detector = ObjectDetector()
exam_logger = ExamLogger()
print("Models Initialized!")

EVIDENCE_DIR = "evidence"
os.makedirs(EVIDENCE_DIR, exist_ok=True)


STATE_TTL_SECONDS = 30 * 60
# Keep in sync with Node/frontend cooldowns (8000ms).
VIOLATION_COOLDOWN_SECONDS = 8
# Require more sustained behavior before flagging to avoid false positives.
NO_FACE_STREAK_FOR_HIGH = 5      # ~10s at ~2 FPS
MULTI_FACE_STREAK_FOR_HIGH = 3   # ~6s at ~2 FPS
OBJECT_STREAK_FOR_HIGH = 2
OBJECT_IMMEDIATE_CONFIDENCE = 0.6
HIGH_SUSPICION_SCORE_THRESHOLD = 80  # was 70 — too sensitive


class FrameData(BaseModel):
    image: str
    session_id: Optional[str] = Field(None, alias="sessionId")
    exam_id: Optional[str] = Field(None, alias="examId")
    objects_only: bool = Field(False, alias="objectsOnly")
    calibration: Optional[Dict[str, float]] = None

    class Config:
        populate_by_name = True  # Allow both camelCase and snake_case


class SessionState:
    def __init__(self):
        # Primary: MediaPipe Holistic (face + pose + hands in one pass)
        # Use static_image_mode=True for web sessions. Frames arrive at ~1-2 FPS,
        # so tracking mode loses context between frames and fails frequently.
        self.holistic = HolisticDetector(
            static_image_mode=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
            smooth_alpha=0.8,  # High alpha for sparse frames (~2s apart)
        )
        self.holistic_available = True
        self.holistic_failures = 0

        # Fallback: Separate modules (used when holistic fails)
        self.mesh_detector = FaceMeshDetector(
            static_image_mode=True,
            max_num_faces=2,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.behavior_analyzer = BehaviorAnalyzer()
        self.gaze_tracker = EyeGazeTracker()
        self.pretrained_gaze = PretrainedGazeEstimator(
            provider=os.getenv("GAZE_MODEL_PROVIDER", "auto")
        )
        self.gaze_fusion = GazeFusion(
            min_confidence=float(os.getenv("GAZE_MODEL_MIN_CONF", "0.62")),
            window_size=int(os.getenv("GAZE_MODEL_WINDOW", "5")),
            stable_count=int(os.getenv("GAZE_MODEL_STABLE_COUNT", "3")),
        )
        self.head_pose = HeadPoseEstimator()
        self.no_face_streak = 0
        self.detector_only_streak = 0
        self.multi_face_streak = 0
        self.object_streaks: Dict[str, int] = {}
        self.frame_count = 0
        self.last_violation_type: Optional[str] = None
        self.last_violation_at = 0.0
        self.last_updated = time.time()
        self.evidence_captured = False

    def close(self):
        try:
            self.holistic.close()
        except Exception:
            pass
        try:
            self.mesh_detector.face_mesh.close()
        except Exception:
            pass


SESSION_STATES: Dict[str, SessionState] = {}
STATE_LOCK = threading.Lock()


def _build_session_key(payload: FrameData):
    if payload.session_id and payload.session_id.strip():
        return f"session:{payload.session_id.strip()}"
    if payload.exam_id and payload.exam_id.strip():
        return f"exam:{payload.exam_id.strip()}"
    return "anonymous"


def _get_session_state(session_key: str, calibration: Optional[Dict[str, float]] = None):
    now = time.time()
    with STATE_LOCK:
        stale_keys = [
            key
            for key, value in SESSION_STATES.items()
            if now - value.last_updated > STATE_TTL_SECONDS
        ]
        for stale_key in stale_keys:
            try:
                SESSION_STATES[stale_key].close()
            except Exception:
                pass
            del SESSION_STATES[stale_key]

        state = SESSION_STATES.get(session_key)
        is_new = state is None
        if is_new:
            state = SessionState()
            SESSION_STATES[session_key] = state

        state.last_updated = now

        # Apply calibration baselines to new sessions so trackers start
        # pre-calibrated instead of using the noisy first frame.
        if is_new and calibration:
            # Apply to holistic detector
            state.holistic.apply_calibration(
                gaze_h_baseline=calibration.get("gaze_h_baseline"),
                gaze_v_baseline=calibration.get("gaze_v_baseline"),
                head_yaw_baseline=calibration.get("head_yaw_baseline"),
                head_pitch_baseline=calibration.get("head_pitch_baseline"),
            )
            # Apply to fallback modules too
            if "gaze_h_baseline" in calibration:
                state.gaze_tracker.baseline_h_ratio = calibration["gaze_h_baseline"]
                state.gaze_tracker.smoothed_h_ratio = calibration["gaze_h_baseline"]
            if "gaze_v_baseline" in calibration:
                state.gaze_tracker.baseline_v_ratio = calibration["gaze_v_baseline"]
                state.gaze_tracker.smoothed_v_ratio = calibration["gaze_v_baseline"]
            if "head_yaw_baseline" in calibration:
                state.head_pose.yaw_bias = calibration["head_yaw_baseline"]
                state.head_pose.smoothed_yaw = calibration["head_yaw_baseline"]
            if "head_pitch_baseline" in calibration:
                state.head_pose.pitch_bias = calibration["head_pitch_baseline"]
                state.head_pose.smoothed_pitch = calibration["head_pitch_baseline"]

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
    with STATE_LOCK:
        states = list(SESSION_STATES.values())

    any_model_available = any(state.pretrained_gaze.available for state in states)
    backend_names = sorted(
        {
            state.pretrained_gaze.backend_name
            for state in states
            if state.pretrained_gaze.backend_name != "none"
        }
    )
    return {
        "status": "ok",
        "service": "ai-proctoring",
        "sessions_active": len(SESSION_STATES),
        "gaze_model_available": bool(any_model_available),
        "gaze_model_backends": backend_names,
    }


@app.post("/process_frame")
async def process_frame(data: FrameData):
    try:
        frame = _decode_frame(data.image)
        # NOTE: Browser webcam feeds are already mirrored. Do NOT flip again
        # to avoid inverting left/right gaze detection.
        h, w, _ = frame.shape

        session_key = _build_session_key(data)
        state = _get_session_state(session_key, calibration=data.calibration)
        state.frame_count += 1

        # 1. Face detection + mesh cross-check.
        frame, detector_face_count = face_detector.detect_faces(frame)
        mesh_results = state.mesh_detector.process(frame)
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

        multi_face_detected = effective_face_count > 1

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
        display_object_alerts = active_object_alerts if active_object_alerts else raw_objects
        phone_detected = "cell phone" in display_object_alerts
        prohibited_object_detected = len(raw_objects) > 0

        # If objects_only mode (browser handles face/gaze), skip face mesh entirely.
        if data.objects_only:
            violation_type = None
            should_log = False
            if prohibited_object_detected:
                violation_type = "PROHIBITED_OBJECT"
                should_log = _should_log_violation(state, violation_type)

            return {
                "face_count": -1,
                "gaze_direction": "BROWSER_SIDE",
                "head_direction": "BROWSER_SIDE",
                "suspicion_score": 0,
                "risk_level": "LOW" if not prohibited_object_detected else "HIGH",
                "objects": display_object_alerts,
                "confirmed_objects": confirmed_objects,
                "high_confidence_objects": high_confidence_objects,
                "object_detections": object_detections,
                "violation_type": violation_type,
                "should_log_violation": should_log,
                "objects_only": True,
            }

        # 3. Gaze/head behavior — try holistic first, then fallback.
        gaze_dir = "LOOKING CENTER"
        gaze_source = "none"
        gaze_confidence = 0.0
        head_dir = "HEAD STRAIGHT"
        head_angle = 0.0
        body_alerts = []
        hand_alerts = []
        analysis_engine = "none"
        score = int(round(state.behavior_analyzer.suspicion_score))

        holistic_result = None
        if state.holistic_available:
            try:
                holistic_result = state.holistic.analyze(frame)
            except Exception as holistic_err:
                state.holistic_failures += 1
                if state.holistic_failures >= 5:
                    state.holistic_available = False
                    print(f"[Server] Holistic disabled after {state.holistic_failures} failures: {holistic_err}")

        if holistic_result and holistic_result.face_detected:
            # ── Primary: Holistic engine ──
            analysis_engine = "holistic"
            gaze_dir = holistic_result.gaze_direction
            gaze_source = "holistic"
            gaze_confidence = 0.75
            head_dir = holistic_result.head_direction
            head_angle = holistic_result.head_angle
            body_alerts = holistic_result.body_alerts
            hand_alerts = holistic_result.hand_alerts

            # Still try pretrained gaze for higher accuracy if available
            head_pitch = holistic_result.head_pitch
            model_gaze_dir, model_gaze_conf, _ = state.pretrained_gaze.predict(
                frame, head_pitch=head_pitch,
            )
            if model_gaze_dir and model_gaze_conf >= 0.62:
                gaze_dir = model_gaze_dir
                gaze_source = "holistic+l2cs"
                gaze_confidence = model_gaze_conf

            score = state.behavior_analyzer.analyze(gaze_dir, head_dir)

            # Body posture penalties
            if holistic_result.posture_suspicious:
                posture_penalty = min(15, len(body_alerts) * 5 + len(hand_alerts) * 5)
                score = min(100, score + posture_penalty)

        elif mesh_face_count > 0 and mesh_results.multi_face_landmarks:
            # ── Fallback: Separate modules ──
            analysis_engine = "fallback"
            landmarks = mesh_results.multi_face_landmarks[0].landmark
            head_dir, head_angle = state.head_pose.estimate(landmarks)
            head_pitch = float(state.head_pose.last_metrics.get("pitch", 0.0))
            legacy_gaze_dir = state.gaze_tracker.get_gaze_direction(
                landmarks,
                w,
                h,
                head_pitch=head_pitch,
            )
            model_gaze_dir, model_gaze_conf, _ = state.pretrained_gaze.predict(
                frame,
                head_pitch=head_pitch,
            )
            gaze_dir, gaze_source, gaze_confidence = state.gaze_fusion.resolve(
                legacy_label=legacy_gaze_dir,
                model_label=model_gaze_dir,
                model_confidence=model_gaze_conf,
                head_pitch=head_pitch,
            )
            score = state.behavior_analyzer.analyze(gaze_dir, head_dir)
        else:
            # Mild decay while no mesh landmarks are available.
            score = state.behavior_analyzer.reduce_penalty(1.0)
            if state.no_face_streak >= 3:
                state.gaze_tracker.reset()
                state.gaze_fusion.reset()
                state.head_pose.reset()
                state.holistic.reset()

        # 4. Risk composition from multiple signals.
        if state.no_face_streak >= 2:
            # Penalize only after sustained absence to avoid transient misses.
            no_face_penalty = min(65, 8 + state.no_face_streak * 8)
            score = max(score, no_face_penalty)
        if state.multi_face_streak > 0:
            multi_face_penalty = min(90, 30 + state.multi_face_streak * 15)
            score = max(score, multi_face_penalty)
        
        # Explicit score adjustments from requirements
        if multi_face_detected:
            score += 5
        if phone_detected:
            score += 10

        if prohibited_object_detected:
            score = max(score, 90)

        score = int(max(0, min(100, score)))

        violation_type = None
        if phone_detected:
            violation_type = "PROHIBITED_OBJECT"
        elif prohibited_object_detected:
            violation_type = "PROHIBITED_OBJECT"
        elif state.multi_face_streak >= MULTI_FACE_STREAK_FOR_HIGH:
            violation_type = "MULTIPLE_FACES"
        elif state.no_face_streak >= NO_FACE_STREAK_FOR_HIGH:
            violation_type = "NO_FACE"
        elif score >= HIGH_SUSPICION_SCORE_THRESHOLD:
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
        
        # Override for phone
        if phone_detected:
             risk_level = "HIGH"
             risk_color = (0, 0, 255)

        # Evidence Capture
        if risk_level == "HIGH" and not state.evidence_captured:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            reason = "MULTI_FACE" if multi_face_detected else (violation_type or "SUSPICIOUS_BEHAVIOR")
            filename = os.path.join(EVIDENCE_DIR, f"evidence_{reason}_{timestamp}.jpg")
            
            # Save original frame
            cv2.imwrite(filename, frame)
            state.evidence_captured = True
        elif risk_level != "HIGH":
            state.evidence_captured = False

        # Logging
        exam_logger.log(
            gaze_dir, 
            head_dir, 
            head_angle, 
            effective_face_count, 
            score, 
            risk_level, 
            ",".join(display_object_alerts)
        )

        should_log_violation = _should_log_violation(state, violation_type)

        # Drawing Overlay
        cv2.putText(frame, f"Gaze: {gaze_dir}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(frame, f"Head: {head_dir}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(frame, f"Suspicion Score: {score}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        cv2.putText(frame, f"Angle: {int(head_angle)}", (20, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
        cv2.putText(frame, f"Risk Level: {risk_level}", (20, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.8, risk_color, 2)
        
        cv2.putText(frame, f"Faces Detected: {effective_face_count}", (20, h - 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

        if risk_level == "HIGH":
             cv2.putText(frame, "EVIDENCE CAPTURED", (w - 320, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        if phone_detected:
            cv2.putText(frame, "WARNING: PHONE DETECTED", (w - 380, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        _, buffer = cv2.imencode(".jpg", frame)
        processed_image_b64 = base64.b64encode(buffer).decode("utf-8")

        return {
            "success": True,
            "face_count": int(effective_face_count),
            "raw_face_count": int(detector_face_count),
            "mesh_face_count": int(mesh_face_count),
            "objects": display_object_alerts,
            "active_object_alerts": active_object_alerts,
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
            "gaze_source": gaze_source,
            "gaze_confidence": float(gaze_confidence),
            "gaze_model_backend": state.pretrained_gaze.backend_name,
            "gaze_model_available": bool(state.pretrained_gaze.available),
            "gaze_ratio_raw": float(state.gaze_tracker.last_raw_ratio),
            "gaze_ratio": float(state.gaze_tracker.last_normalized_ratio),
            "head_direction": head_dir,
            "head_angle": float(head_angle),
            "head_yaw": float(state.head_pose.last_metrics.get("yaw", 0.0)),
            "head_pitch": float(state.head_pose.last_metrics.get("pitch", 0.0)),
            "head_roll": float(state.head_pose.last_metrics.get("roll", 0.0)),
            "analysis_engine": analysis_engine,
            "body_alerts": body_alerts,
            "hand_alerts": hand_alerts,
            "holistic_available": bool(state.holistic_available),
            "processed_image": f"data:image/jpeg;base64,{processed_image_b64}",
        }
    except HTTPException:
        raise
    except Exception as error:
        print(f"Error processing frame: {error}")
        raise HTTPException(status_code=500, detail=str(error))


class CalibrationData(BaseModel):
    images: list[str]  # Multiple base64 frames


@app.post("/calibrate")
async def calibrate(data: CalibrationData):
    """Process multiple frames where the student is looking at screen center.
    Returns averaged baseline ratios for gaze and head pose so the session
    trackers can start pre-calibrated instead of relying on the first frame."""
    if not data.images or len(data.images) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 calibration frames")

    # Use temporary tracker instances so we don't pollute any exam session.
    temp_mesh = FaceMeshDetector(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    temp_gaze = EyeGazeTracker()
    temp_head = HeadPoseEstimator()

    h_ratios: list[float] = []
    v_ratios: list[float] = []
    yaw_values: list[float] = []
    pitch_values: list[float] = []
    faces_ok = 0

    try:
        for img_data in data.images[:20]:  # cap at 20 frames
            try:
                frame = _decode_frame(img_data)
                h, w, _ = frame.shape
                mesh_results = temp_mesh.process(frame)
                if not mesh_results or not mesh_results.multi_face_landmarks:
                    continue
                landmarks = mesh_results.multi_face_landmarks[0].landmark
                temp_gaze.get_gaze_direction(landmarks, w, h)
                temp_head.estimate(landmarks)

                if temp_gaze.smoothed_h_ratio is not None:
                    h_ratios.append(temp_gaze.smoothed_h_ratio)
                if temp_gaze.smoothed_v_ratio is not None:
                    v_ratios.append(temp_gaze.smoothed_v_ratio)
                if temp_head.smoothed_yaw is not None:
                    yaw_values.append(temp_head.smoothed_yaw)
                if temp_head.smoothed_pitch is not None:
                    pitch_values.append(temp_head.smoothed_pitch)
                faces_ok += 1
            except Exception:
                continue
    finally:
        try:
            temp_mesh.face_mesh.close()
        except Exception:
            pass

    if faces_ok < 2:
        raise HTTPException(status_code=422, detail="Could not detect face in enough frames")

    baselines = {
        "gaze_h_baseline": statistics.mean(h_ratios) if h_ratios else 0.5,
        "gaze_v_baseline": statistics.mean(v_ratios) if v_ratios else 0.5,
        "head_yaw_baseline": statistics.mean(yaw_values) if yaw_values else 0.0,
        "head_pitch_baseline": statistics.mean(pitch_values) if pitch_values else 0.0,
        "frames_used": faces_ok,
    }
    return {"success": True, "baselines": baselines}


class SystemCheckData(BaseModel):
    image: str


@app.post("/system_check")
async def system_check(data: SystemCheckData):
    """Lightweight face-only check for the pre-exam system check page.
    Does NOT create a persistent session state."""
    try:
        frame = _decode_frame(data.image)
        _, detector_face_count = face_detector.detect_faces(frame)
        return {
            "success": True,
            "face_count": int(detector_face_count),
        }
    except HTTPException:
        raise
    except Exception as error:
        print(f"Error in system_check: {error}")
        raise HTTPException(status_code=500, detail=str(error))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
