"""AI Proctoring API Server using MediaPipe Holistic.

This server uses the HolisticDetector which combines face mesh, body pose,
and hand tracking in a single pass for better accuracy and performance.
"""

import base64
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Import from local modules
from modules.holistic_detector import HolisticDetector, HolisticResult
from modules.behavior import BehaviorAnalyzer
from modules.face_detection import FaceDetector
from modules.object_detector import ObjectDetector
from modules.logger import ExamLogger


app = FastAPI(title="AI Proctoring Service", version="2.0")

# CORS configuration
_DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:5173",
]
_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("AI_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
] or _DEFAULT_ALLOWED_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize global detectors
print("Initializing AI Proctoring CV models...")
face_detector = FaceDetector()
object_detector = ObjectDetector()
exam_logger = ExamLogger()
print("AI Proctoring CV models initialized")

# Directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EVIDENCE_DIR = os.path.join(BASE_DIR, "evidence")
os.makedirs(EVIDENCE_DIR, exist_ok=True)

# Session management
STATE_TTL_SECONDS = 60  # Reduced to 60 seconds for faster threshold updates during dev (was 30*60)
VIOLATION_COOLDOWN_SECONDS = 8


class FrameData(BaseModel):
    image: str
    session_id: Optional[str] = Field(None, alias="sessionId")
    exam_id: Optional[str] = Field(None, alias="examId")
    objects_only: bool = Field(False, alias="objectsOnly")
    tracking_only: bool = Field(False, alias="trackingOnly")
    include_processed_image: bool = Field(False, alias="includeProcessedImage")
    calibration: Optional[Dict[str, float]] = None

    class Config:
        populate_by_name = True


class CalibrationData(BaseModel):
    images: List[str]


class SystemCheckData(BaseModel):
    image: str


@dataclass
class SessionState:
    """Per-session state with HolisticDetector for unified tracking."""
    holistic: HolisticDetector = field(default_factory=lambda: HolisticDetector(static_image_mode=False))
    behavior_analyzer: BehaviorAnalyzer = field(default_factory=BehaviorAnalyzer)
    last_violation_type: Optional[str] = None
    last_violation_at: float = 0.0
    last_updated: float = field(default_factory=time.time)
    calibration_applied: bool = False


SESSION_STATES: Dict[str, SessionState] = {}
STATE_LOCK = threading.Lock()


def _build_session_key(payload: FrameData) -> str:
    if payload.session_id and payload.session_id.strip():
        return f"session:{payload.session_id.strip()}"
    if payload.exam_id and payload.exam_id.strip():
        return f"exam:{payload.exam_id.strip()}"
    return "anonymous"


def _get_state(session_key: str) -> SessionState:
    now = time.time()
    with STATE_LOCK:
        # Clean up stale sessions
        stale = [
            key for key, value in SESSION_STATES.items()
            if now - value.last_updated > STATE_TTL_SECONDS
        ]
        for key in stale:
            try:
                SESSION_STATES[key].holistic.close()
            except Exception:
                pass
            del SESSION_STATES[key]

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


def _risk_from_score(score: int, face_count: int, detected_objects: List[str]) -> str:
    if face_count > 1 or detected_objects or score >= 40:
        return "HIGH"
    if score >= 15:
        return "MEDIUM"
    return "LOW"


def _violation_type(face_count: int, detected_objects: List[str], score: int) -> Optional[str]:
    if detected_objects:
        return "PROHIBITED_OBJECT"
    if face_count > 1:
        return "MULTIPLE_FACES"
    if face_count == 0:
        return "NO_FACE"
    if score >= 100:
        return "HIGH_SUSPICION"
    return None


def _should_log_violation(state: SessionState, violation: Optional[str]) -> bool:
    if not violation:
        return False

    now = time.time()
    if state.last_violation_type == violation and (now - state.last_violation_at) < VIOLATION_COOLDOWN_SECONDS:
        return False

    state.last_violation_type = violation
    state.last_violation_at = now
    return True


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ai-proctoring",
        "version": "2.0",
        "source": "AI_PROCTORING/server.py",
        "sessions_active": len(SESSION_STATES),
    }


@app.post("/reset_session")
async def reset_session(data: FrameData):
    """Reset session state to pick up new threshold values."""
    session_key = _build_session_key(data)
    with STATE_LOCK:
        if session_key in SESSION_STATES:
            try:
                SESSION_STATES[session_key].holistic.close()
            except Exception:
                pass
            del SESSION_STATES[session_key]
    return {"success": True, "message": "Session reset successfully"}


@app.post("/system_check")
async def system_check(data: SystemCheckData):
    frame = _decode_frame(data.image)
    # Flip frame horizontally to match webcam mirror behavior
    frame = cv2.flip(frame, 1)
    _, face_count = face_detector.detect_faces(frame)
    return {"success": True, "face_count": int(face_count)}


@app.post("/calibrate")
async def calibrate(data: CalibrationData):
    """Calibrate gaze baselines from multiple frames.

    Validates that the user was looking straight ahead during calibration.
    If extreme values are detected, returns error asking user to recalibrate.
    """
    if not data.images or len(data.images) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 calibration frames")

    # Use a temporary holistic detector for calibration
    temp_holistic = HolisticDetector(static_image_mode=False)
    h_ratios = []
    v_ratios = []
    yaw_values = []
    pitch_values = []

    for img_data in data.images[:20]:  # Max 20 frames
        try:
            frame = _decode_frame(img_data)
            # Flip frame horizontally to match webcam mirror behavior
            frame = cv2.flip(frame, 1)
            result = temp_holistic.analyze(frame)
            if result.face_detected:
                h_ratios.append(result.gaze_h_ratio)
                v_ratios.append(result.gaze_v_ratio)
                yaw_values.append(result.head_yaw)
                pitch_values.append(result.head_pitch)
        except Exception:
            continue

    temp_holistic.close()

    if len(h_ratios) < 2:
        return {
            "success": False,
            "message": "Could not detect face in enough frames. Please ensure your face is clearly visible.",
            "baselines": {
                "gaze_h_baseline": 0.5,
                "gaze_v_baseline": 0.5,
                "head_yaw_baseline": 0.0,
                "head_pitch_baseline": 0.0,
                "frames_used": 0,
            },
        }

    # Calculate median values
    median_h = float(np.median(h_ratios))
    median_v = float(np.median(v_ratios))
    median_yaw = float(np.median(yaw_values))
    median_pitch = float(np.median(pitch_values))

    # Validation: check if user was looking straight ahead
    # Acceptable ranges for calibration (user should be looking at center of screen)
    validation_errors = []

    # Head should be roughly straight (yaw and pitch close to 0)
    # More lenient thresholds to account for natural variation and camera angles
    if abs(median_yaw) > 0.25:
        direction = "left" if median_yaw < 0 else "right"
        validation_errors.append(f"Head is turned too far {direction} (yaw: {median_yaw:.2f}, should be < 0.25)")

    if abs(median_pitch) > 0.25:
        direction = "up" if median_pitch < 0 else "down"
        validation_errors.append(f"Head is tilted too far {direction} (pitch: {median_pitch:.2f}, should be < 0.25)")

    # Gaze should be roughly centered (h_ratio and v_ratio close to 0.5)
    # Wider range to account for natural eye position variation
    if median_h < 0.30 or median_h > 0.70:
        direction = "left" if median_h < 0.5 else "right"
        validation_errors.append(f"Eyes are looking too far {direction} (h_ratio: {median_h:.2f}, should be 0.30-0.70)")

    if median_v < 0.30 or median_v > 0.70:
        direction = "up" if median_v < 0.5 else "down"
        validation_errors.append(f"Eyes are looking too far {direction} (v_ratio: {median_v:.2f}, should be 0.30-0.70)")

    # If validation failed, return error with instructions
    if validation_errors:
        return {
            "success": False,
            "message": "Calibration failed - please recalibrate while looking straight at the camera.",
            "validation_errors": validation_errors,
            "detected_values": {
                "gaze_h_ratio": median_h,
                "gaze_v_ratio": median_v,
                "head_yaw": median_yaw,
                "head_pitch": median_pitch,
            },
            "instructions": [
                "Look directly at the center of your screen/camera",
                "Keep your head straight (not tilted or turned)",
                "Make sure your eyes are looking at the camera, not away",
                "Then try calibration again"
            ],
            "baselines": {
                "gaze_h_baseline": 0.5,
                "gaze_v_baseline": 0.5,
                "head_yaw_baseline": 0.0,
                "head_pitch_baseline": 0.0,
                "frames_used": 0,
            },
        }

    # Validation passed - return calibrated baselines
    return {
        "success": True,
        "message": "Calibration successful!",
        "baselines": {
            "gaze_h_baseline": median_h,
            "gaze_v_baseline": median_v,
            "head_yaw_baseline": median_yaw,
            "head_pitch_baseline": median_pitch,
            "frames_used": len(h_ratios),
        },
        "detected_values": {
            "gaze_h_ratio": median_h,
            "gaze_v_ratio": median_v,
            "head_yaw": median_yaw,
            "head_pitch": median_pitch,
        },
    }


@app.post("/process_frame")
async def process_frame(data: FrameData):
    frame = _decode_frame(data.image)

    # Flip frame horizontally to match webcam mirror behavior (same as main.py)
    frame = cv2.flip(frame, 1)

    h, w, _ = frame.shape

    state = _get_state(_build_session_key(data))

    # Apply calibration if provided and not yet applied
    if data.calibration and not state.calibration_applied:
        state.holistic.apply_calibration(
            gaze_h_baseline=data.calibration.get("gaze_h_baseline"),
            gaze_v_baseline=data.calibration.get("gaze_v_baseline"),
            head_yaw_baseline=data.calibration.get("head_yaw_baseline"),
            head_pitch_baseline=data.calibration.get("head_pitch_baseline"),
        )
        state.calibration_applied = True

    include_processed_image = bool(data.include_processed_image)
    objects_only_mode = bool(data.objects_only)
    tracking_only_mode = bool(data.tracking_only) and not objects_only_mode

    # Fast face count; only draw boxes when a processed image was requested.
    frame_with_faces, face_count = face_detector.detect_faces(
        frame,
        draw=include_processed_image,
    )
    detected_objects: List[str] = []

    # Objects-only mode (background object checks at lower frequency).
    if objects_only_mode:
        detected_objects = object_detector.detect(frame)
        violation = _violation_type(face_count=-1, detected_objects=detected_objects, score=0)
        should_log = _should_log_violation(state, violation)
        return {
            "face_count": -1,
            "gaze_direction": "BROWSER_SIDE",
            "head_direction": "BROWSER_SIDE",
            "suspicion_score": 0,
            "risk_level": "HIGH" if detected_objects else "LOW",
            "objects": detected_objects,
            "confirmed_objects": detected_objects,
            "high_confidence_objects": detected_objects,
            "violation_type": violation,
            "should_log_violation": should_log,
            "objects_only": True,
            "tracking_only": False,
            "processed_image": None,
        }

    # Skip heavy object detection on the fast tracking path.
    if not tracking_only_mode:
        detected_objects = object_detector.detect(frame)

    # Run holistic analysis (face mesh + pose + hands in one pass)
    result: HolisticResult = state.holistic.analyze(frame)

    # Get gaze and head direction from holistic result
    gaze = result.gaze_direction if result.face_detected else "LOOKING CENTER"
    head = result.head_direction if result.face_detected else "HEAD STRAIGHT"
    angle = result.head_roll if result.face_detected else 0.0

    # Update face count from holistic if it detected a face
    if result.face_detected and face_count == 0:
        face_count = 1

    # Calculate suspicion score
    score = int(state.behavior_analyzer.analyze(gaze, head))

    # Add penalties for multiple faces or prohibited objects
    if face_count > 1:
        score += 5
    if detected_objects and not tracking_only_mode:
        score += 10
    score = int(max(0, min(100, score)))

    risk_level = _risk_from_score(score, face_count, detected_objects)
    violation = _violation_type(face_count, detected_objects, score)
    should_log = _should_log_violation(state, violation)

    # Log the event
    exam_logger.log(gaze, head, angle, face_count, score, risk_level, detected_objects)

    # Encode image only when explicitly requested or when logging a violation.
    should_attach_image = include_processed_image or should_log
    processed_image = None

    if include_processed_image:
        # Draw debug info on frame
        color_gaze = (0, 255, 0) if gaze == "LOOKING CENTER" else (0, 165, 255)
        color_head = (0, 255, 0) if head == "HEAD STRAIGHT" else (0, 165, 255)
        color_score = (0, 255, 0) if score < 15 else (0, 165, 255) if score < 40 else (0, 0, 255)

        cv2.putText(frame_with_faces, f"Gaze: {gaze}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color_gaze, 2)
        cv2.putText(frame_with_faces, f"Head: {head}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color_head, 2)
        cv2.putText(frame_with_faces, f"Score: {score}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color_score, 2)
        cv2.putText(frame_with_faces, f"Faces: {face_count}", (20, h - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

        # Debug overlay - show raw gaze/head values on right side with black background for visibility
        if result.face_detected:
            # Draw semi-transparent black background for text (larger for thresholds)
            overlay = frame_with_faces.copy()
            cv2.rectangle(overlay, (w - 200, 15), (w - 5, 280), (0, 0, 0), -1)
            cv2.addWeighted(overlay, 0.6, frame_with_faces, 0.4, 0, frame_with_faces)

            # Current values (cyan)
            cv2.putText(frame_with_faces, "=== VALUES ===", (w - 190, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 1)
            cv2.putText(frame_with_faces, f"H: {result.gaze_h_ratio:.3f}", (w - 190, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)
            cv2.putText(frame_with_faces, f"V: {result.gaze_v_ratio:.3f}", (w - 190, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)
            cv2.putText(frame_with_faces, f"Yaw: {result.head_yaw:.3f}", (w - 190, 115), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 0), 2)
            cv2.putText(frame_with_faces, f"Pitch: {result.head_pitch:.3f}", (w - 190, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 0), 2)

            # Thresholds (green)
            cv2.putText(frame_with_faces, "=== THRESHOLDS ===", (w - 190, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 1)
            cv2.putText(frame_with_faces, "GAZE:", (w - 190, 195), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)
            cv2.putText(frame_with_faces, "LEFT < 0.45", (w - 185, 215), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 200, 255), 1)
            cv2.putText(frame_with_faces, "RIGHT > 0.55", (w - 185, 233), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 200, 255), 1)

            cv2.putText(frame_with_faces, "HEAD:", (w - 190, 255), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)
            cv2.putText(frame_with_faces, "UP < 0.02 | DOWN > 0.23", (w - 185, 273), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (150, 255, 200), 1)

        if detected_objects:
            cv2.putText(frame_with_faces, f"Objects: {', '.join(detected_objects)}", (20, h - 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    if should_attach_image:
        _, buffer = cv2.imencode(".jpg", frame_with_faces)
        processed_image_b64 = base64.b64encode(buffer).decode("utf-8")
        processed_image = f"data:image/jpeg;base64,{processed_image_b64}"

    return {
        "success": True,
        "face_count": int(face_count),
        "objects": detected_objects,
        "confirmed_objects": detected_objects,
        "high_confidence_objects": detected_objects,
        "suspicion_score": score,
        "risk_level": risk_level,
        "violation_type": violation,
        "should_log_violation": should_log,
        "gaze_direction": gaze,
        "head_direction": head,
        "head_angle": float(angle),
        "gaze_h_ratio": float(result.gaze_h_ratio),
        "gaze_v_ratio": float(result.gaze_v_ratio),
        "head_yaw": float(result.head_yaw),
        "head_pitch": float(result.head_pitch),
        "body_alerts": result.body_alerts,
        "hand_alerts": result.hand_alerts,
        "objects_only": False,
        "tracking_only": tracking_only_mode,
        "processed_image": processed_image,
    }


if __name__ == "__main__":
    port = int(os.getenv("AI_PROCTORING_PORT", "8000"))
    print(f"Starting AI Proctoring server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
