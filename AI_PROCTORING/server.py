import cv2
import base64
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys
import os
import uvicorn

# Add current directory to path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import modules
from modules.face_detection import FaceDetector
from modules.face_mesh import FaceMeshDetector
from modules.eye_gaze import EyeGazeTracker
from modules.head_pose import HeadPoseEstimator
from modules.behavior import BehaviorAnalyzer
from modules.object_detector import ObjectDetector

app = FastAPI()

# Enable CORS (Though only Node should call this, we can restrict origins later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, change to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Models
print("Initializing AI Models...")
face_detector = FaceDetector()
mesh_detector = FaceMeshDetector()

try:
    gaze_tracker = EyeGazeTracker()
except Exception as e:
    print(f"Warning: EyeGazeTracker init failed: {e}")
    gaze_tracker = None

head_pose = HeadPoseEstimator()
behavior_analyzer = BehaviorAnalyzer()
object_detector = ObjectDetector()
print("Models Initialized!")

class FrameData(BaseModel):
    image: str

@app.post("/process_frame")
async def process_frame(data: FrameData):
    try:
        image_data = data.image
        
        if not image_data:
            raise HTTPException(status_code=400, detail="No image data")

        # Decode Base64 image
        if ',' in image_data:
            image_data = image_data.split(',')[1]
            
        try:
            image_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception:
             raise HTTPException(status_code=400, detail="Failed to decode image")
        
        if frame is None:
             raise HTTPException(status_code=400, detail="Failed to decode image")

        h, w, _ = frame.shape

        # 1. Face Detection
        frame, face_count = face_detector.detect_faces(frame)
        face_count = int(face_count)
        multi_face = face_count > 1
        
        # 2. Object Detection
        detected_objects = object_detector.detect(frame)
        phone_detected = "cell phone" in detected_objects
        
        # 3. Face Mesh & Behavior
        mesh_results = mesh_detector.process(frame)
        
        score = 0
        risk_level = "LOW"
        risk_color = (0, 255, 0)
        
        gaze_dir = "CENTER"
        head_dir = "CENTER"

        if mesh_results.multi_face_landmarks:
            for face_landmarks in mesh_results.multi_face_landmarks:
                landmarks = face_landmarks.landmark

                # Gaze
                if gaze_tracker:
                    gaze_dir = gaze_tracker.get_gaze_direction(landmarks, w, h)
                
                # Head Pose
                head_dir, angle = head_pose.estimate(landmarks)
                
                # Behavior Score
                score = behavior_analyzer.analyze(gaze_dir, head_dir)
                
        # Risk Calculation
        if multi_face or score >= 40:
            risk_level = "HIGH"
            risk_color = (0, 0, 255)
        elif score >= 15:
             risk_level = "MEDIUM"
             risk_color = (0, 255, 255)
             
        if multi_face:
            score += 5
            
        if phone_detected:
            score += 10
            risk_level = "HIGH"
            risk_color = (0, 0, 255)

        # Draw Overlay Info
        overlay_color = (0, 255, 0)
        cv2.putText(frame, f"Gaze: {gaze_dir}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, overlay_color, 2)
        cv2.putText(frame, f"Head: {head_dir}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, overlay_color, 2)
        cv2.putText(frame, f"Suspicion: {int(score)}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        cv2.putText(frame, f"Risk: {risk_level}", (20, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.8, risk_color, 2)
        
        if phone_detected:
             cv2.putText(frame, "PHONE DETECTED", (w - 300, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

        # Encode processed frame back to base64
        _, buffer = cv2.imencode('.jpg', frame)
        processed_image_b64 = base64.b64encode(buffer).decode('utf-8')

        return {
            "success": True,
            "face_count": face_count,
            "objects": detected_objects,
            "suspicion_score": int(score),
            "risk_level": risk_level,
            "processed_image": f"data:image/jpeg;base64,{processed_image_b64}"
        }

    except Exception as e:
        print(f"Error processing frame: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    uvicorn.run(app, host="0.0.0.0", port=8000)
