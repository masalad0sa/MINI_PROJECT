import { useRef, useState, useEffect, useCallback } from "react";
import { useFaceLandmarks } from "./useFaceLandmarks";

interface ProctoringState {
  isModelLoading: boolean;
  /** True when browser-side face model failed; server handles all analysis. */
  browserModelFailed: boolean;
  facesDetected: number;
  headPose: "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";
  gazeDirection: "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";
  suspicionScore: number;
  prohibitedObjects: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  debugCanvas: HTMLCanvasElement | null;
  suspicionReasons: string[];
  abnormalDurationMs: number;
}

export interface ViolationEvent {
  type: string;
  evidence: string;
  timestamp: number;
  description?: string;
  detectedObjects?: string[];
  backendLogged?: boolean;
  violationCount?: number;
  shouldAutoSubmit?: boolean;
}

interface UseProctoringOptions {
  examId?: string;
  sessionId?: string;
  /** How often to send frames to server for object detection (ms). Default 2000. */
  objectDetectionIntervalMs?: number;
  violationCooldownMs?: number;
  captureWidth?: number;
  captureHeight?: number;
  imageQuality?: number;
}

export const useProctoring = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onViolation?: (violation: ViolationEvent) => void,
  options: UseProctoringOptions = {},
) => {
  const apiBase =
    ((import.meta as any).env.VITE_API_BASE as string) ||
    "http://localhost:5000/api";

  // ── Browser-side face/gaze/head tracking (30 FPS, no server) ──
  const faceState = useFaceLandmarks(videoRef);

  // ── Server-side object detection state ──
  const [prohibitedObjects, setProhibitedObjects] = useState<string[]>([]);
  const [serverFaceState, setServerFaceState] = useState<{
    faceCount: number;
    gazeDirection: string;
    headDirection: string;
    suspicionScore: number;
    riskLevel: string;
  } | null>(null);
  const [debugCanvas, setDebugCanvas] = useState<HTMLCanvasElement | null>(null);

  const debugCanvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const frameCanvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const proctoringActive = useRef(true);
  const lastObjectDetectTime = useRef<number>(0);
  const lastViolationByType = useRef<Record<string, number>>({});
  const objectDetectTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Send frames to server ──
  // When browser model works: objectsOnly=true (server does YOLO only).
  // When browser model failed: objectsOnly=false (server does full face+gaze+YOLO analysis).
  const detectObjects = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState !== 4 || !proctoringActive.current) {
      return;
    }

    const now = Date.now();
    // If browser model failed, ask server to do full analysis
    const useServerFallback = faceState.modelFailed;

    try {
      const video = videoRef.current;
      const canvas = frameCanvasRef.current;
      const captureWidth = options.captureWidth ?? 640;
      const captureHeight = options.captureHeight ?? 480;
      canvas.width = captureWidth;
      canvas.height = captureHeight;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageQuality = options.imageQuality ?? 0.85;
        const imageData = canvas.toDataURL("image/jpeg", imageQuality);

        const examRouteId = options.examId || "live";
        const token = localStorage.getItem("token");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(`${apiBase}/proctoring/${examRouteId}/frame`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            image: imageData,
            sessionId: options.sessionId || null,
            objectsOnly: !useServerFallback,
          }),
        });

        if (response.ok) {
          const data = await response.json();

          // Update prohibited objects from server
          const objects = Array.isArray(data.objects) ? data.objects : [];
          setProhibitedObjects(objects);

          // When in server fallback mode, capture face/gaze/score from server
          if (useServerFallback && typeof data.face_count === "number" && data.face_count >= 0) {
            setServerFaceState({
              faceCount: data.face_count,
              gazeDirection: typeof data.gaze_direction === "string" ? data.gaze_direction : "LOOKING CENTER",
              headDirection: typeof data.head_direction === "string" ? data.head_direction : "HEAD STRAIGHT",
              suspicionScore: typeof data.suspicion_score === "number" ? data.suspicion_score : 0,
              riskLevel: typeof data.risk_level === "string" ? data.risk_level : "LOW",
            });
          }

          // Render debug image if returned
          if (data.processed_image) {
            const img = new Image();
            img.onload = () => {
              const debugCtx = debugCanvasRef.current.getContext("2d");
              if (debugCtx) {
                debugCanvasRef.current.width = img.width;
                debugCanvasRef.current.height = img.height;
                debugCtx.drawImage(img, 0, 0);
                setDebugCanvas(debugCanvasRef.current);
              }
            };
            img.src = data.processed_image;
          }

          // Handle server-side violations (object detection violations)
          const violationType = typeof data.violation_type === "string" ? data.violation_type : "";
          const shouldLog = Boolean(data.should_log_violation || data.should_notify_violation);
          if (violationType && shouldLog && onViolation) {
            const cooldownMs = options.violationCooldownMs ?? 8000;
            const lastAt = lastViolationByType.current[violationType] || 0;
            if (now - lastAt >= cooldownMs) {
              lastViolationByType.current[violationType] = now;
              onViolation({
                type: violationType,
                evidence: data.processed_image || `AI Detected: ${violationType}`,
                timestamp: now,
                description: data?.violation_details?.description,
                detectedObjects: objects,
                backendLogged: Boolean(data.backend_violation_logged),
                violationCount: data.backend_violation_count,
                shouldAutoSubmit: Boolean(data.backend_should_auto_submit),
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("[Proctoring] Object detection error:", error);
    }

    lastObjectDetectTime.current = now;
  }, [
    apiBase,
    faceState.modelFailed,
    onViolation,
    options.examId,
    options.captureHeight,
    options.captureWidth,
    options.imageQuality,
    options.sessionId,
    options.violationCooldownMs,
    videoRef,
  ]);

  // ── Run object detection on interval ──
  useEffect(() => {
    proctoringActive.current = true;
    const intervalMs = options.objectDetectionIntervalMs ?? 2000;
    objectDetectTimer.current = setInterval(detectObjects, intervalMs);

    return () => {
      proctoringActive.current = false;
      if (objectDetectTimer.current) clearInterval(objectDetectTimer.current);
    };
  }, [detectObjects, options.objectDetectionIntervalMs]);

  // ── Fire violation events for browser-detected issues ──
  // Only fire violations for SUSTAINED behavior (not quick glances)
  useEffect(() => {
    if (!onViolation) return;

    const now = Date.now();
    const cooldownMs = options.violationCooldownMs ?? 8000;
    const minDurationMs = 3000; // Must look away for 3s+ before violation
    const reasons = faceState.suspicionReasons || [];
    const reasonStr = reasons.length > 0 ? ` (${reasons.join(', ')})` : '';

    // No face violation — needs to be sustained (3s+ without face)
    if (faceState.faceCount === 0 && faceState.abnormalDurationMs >= minDurationMs) {
      const lastAt = lastViolationByType.current["NO_FACE"] || 0;
      if (now - lastAt >= cooldownMs) {
        lastViolationByType.current["NO_FACE"] = now;
        onViolation({
          type: "NO_FACE",
          evidence: "No face detected by browser AI",
          timestamp: now,
          description: `No face visible for ${(faceState.abnormalDurationMs / 1000).toFixed(1)}s`,
        });
      }
    }

    // Multiple faces violation — triggers faster (no grace needed)
    if (faceState.faceCount > 1 && faceState.abnormalDurationMs >= 1500) {
      const lastAt = lastViolationByType.current["MULTIPLE_FACES"] || 0;
      if (now - lastAt >= cooldownMs) {
        lastViolationByType.current["MULTIPLE_FACES"] = now;
        onViolation({
          type: "MULTIPLE_FACES",
          evidence: "Multiple faces detected by browser AI",
          timestamp: now,
          description: `${faceState.faceCount} faces detected in camera`,
        });
      }
    }

    // High suspicion violation — only when sustained AND score is high
    if (faceState.suspicionScore >= 70 && faceState.abnormalDurationMs >= minDurationMs) {
      const lastAt = lastViolationByType.current["HIGH_SUSPICION"] || 0;
      if (now - lastAt >= cooldownMs) {
        lastViolationByType.current["HIGH_SUSPICION"] = now;
        onViolation({
          type: "HIGH_SUSPICION",
          evidence: `Suspicion score: ${faceState.suspicionScore}`,
          timestamp: now,
          description: `Sustained suspicious behavior for ${(faceState.abnormalDurationMs / 1000).toFixed(1)}s${reasonStr}`,
        });
      }
    }
  }, [faceState.faceCount, faceState.suspicionScore, faceState.abnormalDurationMs, faceState.suspicionReasons, onViolation, options.violationCooldownMs]);

  // ── Combine browser face state with server object detection ──
  // When browser model failed, use server-side face/gaze/score data instead.
  const useFallback = faceState.modelFailed && serverFaceState !== null;

  const mapServerDirection = (dir: string): "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN" => {
    const d = dir.toUpperCase();
    if (d.includes("LEFT")) return "LEFT";
    if (d.includes("RIGHT")) return "RIGHT";
    if (d.includes("UP")) return "UP";
    if (d.includes("DOWN")) return "DOWN";
    return "CENTER";
  };

  const state: ProctoringState = {
    isModelLoading: faceState.isLoading,
    browserModelFailed: faceState.modelFailed,
    facesDetected: useFallback ? serverFaceState.faceCount : faceState.faceCount,
    headPose: useFallback ? mapServerDirection(serverFaceState.headDirection) : faceState.headPose,
    gazeDirection: useFallback ? mapServerDirection(serverFaceState.gazeDirection) : faceState.gazeDirection,
    suspicionScore: useFallback ? serverFaceState.suspicionScore : faceState.suspicionScore,
    prohibitedObjects,
    riskLevel: prohibitedObjects.length > 0
      ? "HIGH"
      : useFallback
        ? (serverFaceState.riskLevel as "LOW" | "MEDIUM" | "HIGH")
        : faceState.riskLevel,
    debugCanvas,
    suspicionReasons: useFallback ? [] : faceState.suspicionReasons,
    abnormalDurationMs: useFallback ? 0 : faceState.abnormalDurationMs,
  };

  return state;
};
