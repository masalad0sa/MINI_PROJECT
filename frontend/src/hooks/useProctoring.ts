import { useRef, useState, useEffect, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

// Thresholds & Constants
const SUSPICION_THRESHOLD = 50; 
const DECAY_RATE = 1; 
const EVENT_COOLDOWN = 3000; 
const YAW_THRESHOLD = 0.2;
const PITCH_THRESHOLD = 0.2;

interface ProctoringState {
  isModelLoading: boolean;
  facesDetected: number;
  headPose: 'CENTER' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
  gazeDirection: 'CENTER' | 'LEFT' | 'RIGHT';
  suspicionScore: number;
  prohibitedObjects: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  debugCanvas: HTMLCanvasElement | null;
}

export interface ViolationEvent {
  type: string;
  evidence: string;
  timestamp: number;
}

export const useProctoring = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onViolation?: (violation: ViolationEvent) => void
) => {
  const apiBase =
    ((import.meta as any).env.VITE_API_BASE as string) ||
    'http://localhost:5000/api';

  const [state, setState] = useState<ProctoringState>({
    isModelLoading: false, // No local models to load
    facesDetected: 0,
    headPose: 'CENTER',
    gazeDirection: 'CENTER',
    suspicionScore: 0,
    prohibitedObjects: [],
    riskLevel: 'LOW',
    debugCanvas: null, // We'll render the processed image here if needed, or just use the video
  });

  const requestRef = useRef<number>();
  const lastProcessTime = useRef<number>(0);
  const debugCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const proctoringActive = useRef(true);

  // Function to capture frame and send to backend
  const processFrame = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState !== 4 || !proctoringActive.current) {
        requestRef.current = requestAnimationFrame(processFrame);
        return;
    }

    const now = Date.now();
    // PROCESS EVERY 200ms (5 FPS) to reduce lag/network load
    if (now - lastProcessTime.current < 200) {
        requestRef.current = requestAnimationFrame(processFrame);
        return;
    }

    if (!videoRef.current) {
        console.log("[Proctoring] Loop skipping: Video ref is null"); 
        requestRef.current = requestAnimationFrame(processFrame);
        return;
    }

    if (videoRef.current.readyState !== 4) {
        console.log("[Proctoring] Loop skipping: Video not ready (State: " + videoRef.current.readyState + ")"); 
        requestRef.current = requestAnimationFrame(processFrame);
        return;
    }
    
    console.log("[Proctoring] Video ready! Capturing frame...");

    try {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = 640; // Resize for speed
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = canvas.toDataURL('image/jpeg', 0.7); // Compress

            // Send to Node.js Backend (which proxies to Python)
            const response = await fetch(`${apiBase}/exam/1/frame`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            });

            if (response.ok) {
                const data = await response.json();
                
                // Update State
                setState(prev => ({
                    ...prev,
                    facesDetected: data.face_count,
                    suspicionScore: data.suspicion_score,
                    riskLevel: data.risk_level,
                    prohibitedObjects: data.objects || [],
                    // decode processed image
                }));
                
                // Update Debug Canvas with annotated image from backend
                if (data.processed_image) {
                    const img = new Image();
                    img.onload = () => {
                        const debugCtx = debugCanvasRef.current.getContext('2d');
                        if (debugCtx) {
                            debugCanvasRef.current.width = img.width;
                            debugCanvasRef.current.height = img.height;
                            debugCtx.drawImage(img, 0, 0);
                            
                            // Trigger re-render to show updated canvas
                            setState(prev => ({ ...prev, debugCanvas: debugCanvasRef.current }));
                        }
                    };
                    img.src = data.processed_image;
                }

                // Trigger Violation Callback if needed
                if (data.risk_level === 'HIGH' && onViolation) {
                    // console.log("High risk detected by backend");
                    onViolation({
                        type: "AI_FLAG",
                        evidence: "Suspicious behavior detected via AI",
                        timestamp: Date.now()
                    }); // call logic can be added here if we want immediate feedback
                    // For now, ActiveExam tracks state.riskLevel
                }
            } else {
                console.warn("Backend error:", response.statusText);
            }
        }
    } catch (err) {
        console.error("Proctoring error:", err);
    }

    lastProcessTime.current = now;
    requestRef.current = requestAnimationFrame(processFrame);

  }, [apiBase, videoRef, onViolation]);


  useEffect(() => {
    console.log('[Proctoring] Starting backend connection loop...');
    requestRef.current = requestAnimationFrame(processFrame);
    
    return () => {
      proctoringActive.current = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [processFrame]);

  return state;
};
