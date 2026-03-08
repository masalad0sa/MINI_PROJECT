import { useRef, useState, useEffect, useCallback } from "react";
import { useFaceLandmarks } from "./useFaceLandmarks";

interface ProctoringState {
  isModelLoading: boolean;
  /** True when browser-side face model failed; server handles all analysis. */
  browserModelFailed: boolean;
  /** False when the AI backend is unreachable (network error / 5xx). */
  aiServiceAvailable: boolean;
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
  /** Pre-computed gaze/head calibration baselines from PreExamCheck. */
  calibration?: Record<string, number> | null;
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
  const [debugCanvas, setDebugCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );

  const debugCanvasRef = useRef<HTMLCanvasElement>(
    document.createElement("canvas"),
  );
  const frameCanvasRef = useRef<HTMLCanvasElement>(
    document.createElement("canvas"),
  );
  const proctoringActive = useRef(true);
  const lastViolationByType = useRef<Record<string, number>>({});

  // ── Adaptive frame rate + in-flight guard ──
  const requestInFlight = useRef(false);
  const lastRttMs = useRef(1000);
  const consecutiveErrors = useRef(0);
  const [aiServiceAvailable, setAiServiceAvailable] = useState(true);
  const adaptiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Calibration: send with first frame only ──
  const calibrationSent = useRef(false);
  const calibrationData = useRef<Record<string, number> | null>(null);

  // Resolve calibration baselines: prop > sessionStorage > null
  useEffect(() => {
    if (options.calibration) {
      calibrationData.current = options.calibration;
      return;
    }
    if (options.examId) {
      try {
        const stored = sessionStorage.getItem(`calibration:${options.examId}`);
        if (stored) calibrationData.current = JSON.parse(stored);
      } catch {
        // ignore parse errors
      }
    }
  }, [options.calibration, options.examId]);

  /** Compute next interval: faster when server is fast, slower when slow / erroring. */
  const getAdaptiveIntervalMs = useCallback(() => {
    const base = options.objectDetectionIntervalMs ?? 2000;
    if (consecutiveErrors.current >= 3) return Math.min(base * 3, 10000); // back off heavily
    if (consecutiveErrors.current >= 1) return Math.min(base * 2, 6000);
    if (lastRttMs.current < 500) return Math.max(base * 0.75, 1500);
    if (lastRttMs.current > 3000) return Math.min(base * 2, 5000);
    return base;
  }, [options.objectDetectionIntervalMs]);

  // ── Send frames to server ──
  // When browser model works: objectsOnly=true (server does YOLO only).
  // When browser model failed: objectsOnly=false (server does full face+gaze+YOLO analysis).
  const detectObjects = useCallback(async () => {
    if (
      !videoRef.current ||
      videoRef.current.readyState !== 4 ||
      !proctoringActive.current
    ) {
      return;
    }

    // Drop frame if previous request still in flight (prevents queue buildup)
    if (requestInFlight.current) return;

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
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        requestInFlight.current = true;
        const startTime = Date.now();

        // Include calibration baselines with the first frame so the server
        // session starts pre-calibrated for this student's gaze/head position.
        const bodyObj: Record<string, unknown> = {
          image: imageData,
          sessionId: options.sessionId || null,
          objectsOnly: !useServerFallback,
        };
        if (!calibrationSent.current && calibrationData.current) {
          bodyObj.calibration = calibrationData.current;
          calibrationSent.current = true;
        }

        const response = await fetch(
          `${apiBase}/proctoring/${examRouteId}/frame`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(bodyObj),
          },
        );

        lastRttMs.current = Date.now() - startTime;

        if (response.ok) {
          consecutiveErrors.current = 0;
          if (!aiServiceAvailable) setAiServiceAvailable(true);

          const data = await response.json();

          // Update prohibited objects from server
          const objects = Array.isArray(data.objects) ? data.objects : [];
          setProhibitedObjects(objects);

          // When in server fallback mode, capture face/gaze/score from server
          if (
            useServerFallback &&
            typeof data.face_count === "number" &&
            data.face_count >= 0
          ) {
            setServerFaceState({
              faceCount: data.face_count,
              gazeDirection:
                typeof data.gaze_direction === "string"
                  ? data.gaze_direction
                  : "LOOKING CENTER",
              headDirection:
                typeof data.head_direction === "string"
                  ? data.head_direction
                  : "HEAD STRAIGHT",
              suspicionScore:
                typeof data.suspicion_score === "number"
                  ? data.suspicion_score
                  : 0,
              riskLevel:
                typeof data.risk_level === "string" ? data.risk_level : "LOW",
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

          // ── Confidence-aware violation handling ──
          const violationType =
            typeof data.violation_type === "string" ? data.violation_type : "";
          const shouldLog = Boolean(
            data.should_log_violation || data.should_notify_violation,
          );
          const highConfObjects: string[] = Array.isArray(data.high_confidence_objects)
            ? data.high_confidence_objects
            : [];
          const confirmedObjects: string[] = Array.isArray(data.confirmed_objects)
            ? data.confirmed_objects
            : [];

          if (violationType && shouldLog && onViolation) {
            const cooldownMs = options.violationCooldownMs ?? 8000;
            const lastAt = lastViolationByType.current[violationType] || 0;
            if (now - lastAt >= cooldownMs) {
              // For PROHIBITED_OBJECT: only fire if high-confidence OR streak-confirmed
              const isConfident =
                violationType !== "PROHIBITED_OBJECT" ||
                highConfObjects.length > 0 ||
                confirmedObjects.length > 0;

              if (isConfident) {
                lastViolationByType.current[violationType] = now;
                onViolation({
                  type: violationType,
                  evidence:
                    data.processed_image || `AI Detected: ${violationType}`,
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
        } else {
          // Non-OK response (4xx/5xx)
          consecutiveErrors.current++;
          if (consecutiveErrors.current >= 3) setAiServiceAvailable(false);
        }
      }
    } catch (error) {
      consecutiveErrors.current++;
      if (consecutiveErrors.current >= 3) setAiServiceAvailable(false);
      console.error("[Proctoring] Object detection error:", error);
    } finally {
      requestInFlight.current = false;
    }
  }, [
    aiServiceAvailable,
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

  // ── Adaptive interval scheduling ──
  useEffect(() => {
    proctoringActive.current = true;

    const scheduleNext = () => {
      if (!proctoringActive.current) return;
      const intervalMs = getAdaptiveIntervalMs();
      adaptiveTimerRef.current = setTimeout(async () => {
        await detectObjects();
        scheduleNext();
      }, intervalMs);
    };

    // Kick off the first frame immediately
    detectObjects().then(scheduleNext);

    return () => {
      proctoringActive.current = false;
      if (adaptiveTimerRef.current) clearTimeout(adaptiveTimerRef.current);
    };
  }, [detectObjects, getAdaptiveIntervalMs]);

  // ── Fire violation events for browser-detected issues ──
  // Only fire violations for SUSTAINED behavior (not quick glances).
  // SKIP when browser model failed — server handles all violations in that case.
  useEffect(() => {
    if (!onViolation || faceState.modelFailed) return;

    const now = Date.now();
    const cooldownMs = options.violationCooldownMs ?? 8000;
    const minDurationMs = 3000; // Must look away for 3s+ before violation
    const reasons = faceState.suspicionReasons || [];
    const reasonStr = reasons.length > 0 ? ` (${reasons.join(", ")})` : "";

    // No face violation — needs to be sustained (3s+ without face)
    if (
      faceState.faceCount === 0 &&
      faceState.abnormalDurationMs >= minDurationMs
    ) {
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
    if (
      faceState.suspicionScore >= 70 &&
      faceState.abnormalDurationMs >= minDurationMs
    ) {
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
  }, [
    faceState.modelFailed,
    faceState.faceCount,
    faceState.suspicionScore,
    faceState.abnormalDurationMs,
    faceState.suspicionReasons,
    onViolation,
    options.violationCooldownMs,
  ]);

  // ── Combine browser face state with server object detection ──
  // When browser model failed, use server-side face/gaze/score data instead.
  const useFallback = faceState.modelFailed && serverFaceState !== null;

  const mapServerDirection = (
    dir: string,
  ): "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN" => {
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
    aiServiceAvailable,
    facesDetected: useFallback
      ? serverFaceState.faceCount
      : faceState.faceCount,
    headPose: useFallback
      ? mapServerDirection(serverFaceState.headDirection)
      : faceState.headPose,
    gazeDirection: useFallback
      ? mapServerDirection(serverFaceState.gazeDirection)
      : faceState.gazeDirection,
    suspicionScore: useFallback
      ? serverFaceState.suspicionScore
      : faceState.suspicionScore,
    prohibitedObjects,
    riskLevel:
      prohibitedObjects.length > 0
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
