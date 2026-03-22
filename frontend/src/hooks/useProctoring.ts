import { useRef, useState, useEffect, useCallback } from "react";

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
  /** Maximum locally queued frames when network is unstable. */
  maxQueuedFrames?: number;
  /** Max retry attempts for one frame before deferring to queue flush retry. */
  maxRetryAttempts?: number;
  violationCooldownMs?: number;
  captureWidth?: number;
  captureHeight?: number;
  imageQuality?: number;
  /** Pre-computed gaze/head calibration baselines from PreExamCheck. */
  calibration?: Record<string, number> | null;
  /** Force server-side gaze/head analysis even when browser model is healthy. */
  preferServerGaze?: boolean;
  /** Allow browser-side violation emission (disabled by default). */
  enableBrowserViolations?: boolean;
}

interface QueuedFrame {
  image: string;
  capturedAt: number;
  useServerFallback: boolean;
  examRouteId: string;
  sessionId: string | null;
  calibration: Record<string, number> | null;
}

export const useProctoring = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onViolation?: (violation: ViolationEvent) => void,
  options: UseProctoringOptions = {},
) => {
  const apiBase =
    ((import.meta as any).env.VITE_API_BASE as string) ||
    "http://localhost:5000/api";

  // CV analysis is handled by the Proctoring service (Python) only.
  const faceState = {
    isLoading: false,
    modelFailed: false,
    faceCount: 0,
    gazeDirection: "CENTER" as const,
    headPose: "CENTER" as const,
    suspicionScore: 0,
    riskLevel: "LOW" as const,
    suspicionReasons: [] as string[],
    abnormalDurationMs: 0,
  };

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
  const frameQueueRef = useRef<QueuedFrame[]>([]);

  // Resolve calibration baselines: prop > sessionStorage > null
  useEffect(() => {
    if (options.calibration) {
      calibrationData.current = options.calibration;
      return;
    }

    if (options.examId) {
      try {
        const stored = sessionStorage.getItem(`calibration:${options.examId}`);
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, number>;
          calibrationData.current = parsed;
          return;
        }
      } catch {
        // ignore parse errors
      }
    }

    calibrationData.current = null;
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

  // Always use server-side analysis for face/gaze/head CV signals.
  const serverAnalysisActive = true;

  // Frame transport: queue + retry + fallback mode handling.
  const handleServerFrame = useCallback(
    (data: any, frame: QueuedFrame) => {
      const objects = Array.isArray(data.objects) ? data.objects : [];
      setProhibitedObjects(objects);

      if (
        frame.useServerFallback &&
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
            typeof data.suspicion_score === "number" ? data.suspicion_score : 0,
          riskLevel:
            typeof data.risk_level === "string" ? data.risk_level : "LOW",
        });
      }

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

      const violationType =
        typeof data.violation_type === "string" ? data.violation_type : "";
      const shouldLog = Boolean(
        data.should_log_violation || data.should_notify_violation,
      );
      const highConfObjects: string[] = Array.isArray(
        data.high_confidence_objects,
      )
        ? data.high_confidence_objects
        : [];
      const confirmedObjects: string[] = Array.isArray(data.confirmed_objects)
        ? data.confirmed_objects
        : [];

      if (violationType && shouldLog && onViolation) {
        const cooldownMs = options.violationCooldownMs ?? 8000;
        const lastAt = lastViolationByType.current[violationType] || 0;
        if (frame.capturedAt - lastAt >= cooldownMs) {
          const isConfident =
            violationType !== "PROHIBITED_OBJECT" ||
            highConfObjects.length > 0 ||
            confirmedObjects.length > 0;

          if (isConfident) {
            lastViolationByType.current[violationType] = frame.capturedAt;
            onViolation({
              type: violationType,
              evidence: data.processed_image || `AI Detected: ${violationType}`,
              timestamp: frame.capturedAt,
              description: data?.violation_details?.description,
              detectedObjects: objects,
              backendLogged: Boolean(data.backend_violation_logged),
              violationCount: data.backend_violation_count,
              shouldAutoSubmit: Boolean(data.backend_should_auto_submit),
            });
          }
        }
      }
    },
    [onViolation, options.violationCooldownMs],
  );

  const sendQueuedFrame = useCallback(
    async (frame: QueuedFrame) => {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const maxAttempts = Math.max(1, options.maxRetryAttempts ?? 3);
      let delayMs = 400;
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const startTime = Date.now();
          const bodyObj: Record<string, unknown> = {
            image: frame.image,
            sessionId: frame.sessionId,
            objectsOnly: !frame.useServerFallback,
          };
          if (frame.calibration) {
            bodyObj.calibration = frame.calibration;
          }

          const response = await fetch(
            `${apiBase}/proctoring/${frame.examRouteId}/frame`,
            {
              method: "POST",
              headers,
              body: JSON.stringify(bodyObj),
            },
          );

          if (response.ok) {
            const data = await response.json();
            return { ok: true as const, data, rttMs: Date.now() - startTime };
          }

          const retriable =
            response.status >= 500 ||
            response.status === 429 ||
            response.status === 408;
          if (!retriable) {
            return {
              ok: false as const,
              dropFrame: true,
              status: response.status,
              error: new Error(`HTTP ${response.status}`),
            };
          }

          lastError = new Error(`HTTP ${response.status}`);
        } catch (error) {
          lastError = error;
        }

        if (attempt < maxAttempts) {
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
          delayMs = Math.min(delayMs * 2, 4000);
        }
      }

      return {
        ok: false as const,
        dropFrame: false,
        status: null,
        error: lastError,
      };
    },
    [apiBase, options.maxRetryAttempts],
  );

  const flushQueuedFrames = useCallback(async () => {
    if (requestInFlight.current || !proctoringActive.current) return;
    if (frameQueueRef.current.length === 0) return;

    requestInFlight.current = true;
    const maxFramesPerFlush = 3;

    try {
      let processed = 0;
      while (
        proctoringActive.current &&
        frameQueueRef.current.length > 0 &&
        processed < maxFramesPerFlush
      ) {
        const frame = frameQueueRef.current[0];
        const result = await sendQueuedFrame(frame);

        if (!result.ok) {
          if (result.dropFrame) {
            frameQueueRef.current.shift();
          }
          consecutiveErrors.current++;
          if (consecutiveErrors.current >= 3) {
            setAiServiceAvailable(false);
          }
          if (result.error) {
            console.error("[Proctoring] Frame send failed:", result.error);
          }
          break;
        }

        frameQueueRef.current.shift();
        lastRttMs.current = result.rttMs;
        consecutiveErrors.current = 0;
        setAiServiceAvailable((prev) => (prev ? prev : true));

        if (frame.calibration && !calibrationSent.current) {
          calibrationSent.current = true;
          for (const queued of frameQueueRef.current) {
            queued.calibration = null;
          }
        }

        handleServerFrame(result.data, frame);
        processed++;
      }
    } finally {
      requestInFlight.current = false;
    }
  }, [handleServerFrame, sendQueuedFrame]);

  // Send frames to server through a local queue to survive temporary outages.
  const detectObjects = useCallback(async () => {
    if (
      !videoRef.current ||
      videoRef.current.readyState !== 4 ||
      !proctoringActive.current
    ) {
      return;
    }

    // Low-latency mode: when a request is in-flight, skip capturing another
    // frame so we don't build a backlog and show stale analysis results.
    if (requestInFlight.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = frameCanvasRef.current;
    const captureWidth =
      options.captureWidth ?? (serverAnalysisActive ? 480 : 640);
    const captureHeight =
      options.captureHeight ?? (serverAnalysisActive ? 360 : 480);
    canvas.width = captureWidth;
    canvas.height = captureHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageQuality =
      options.imageQuality ?? (serverAnalysisActive ? 0.7 : 0.85);
    const imageData = canvas.toDataURL("image/jpeg", imageQuality);

    const queuedFrame: QueuedFrame = {
      image: imageData,
      capturedAt: Date.now(),
      useServerFallback: serverAnalysisActive,
      examRouteId: options.examId || "live",
      sessionId: options.sessionId || null,
      calibration:
        !calibrationSent.current && calibrationData.current
          ? calibrationData.current
          : null,
    };

    const maxQueuedFrames = Math.max(
      1,
      options.maxQueuedFrames ?? (serverAnalysisActive ? 2 : 10),
    );
    while (frameQueueRef.current.length >= maxQueuedFrames) {
      frameQueueRef.current.shift();
    }
    frameQueueRef.current.push(queuedFrame);

    await flushQueuedFrames();
  }, [
    flushQueuedFrames,
    options.captureHeight,
    options.captureWidth,
    options.examId,
    options.imageQuality,
    options.maxQueuedFrames,
    options.sessionId,
    serverAnalysisActive,
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

  // ── Combine browser face state with server object detection ──
  // When server analysis is active, use server-side face/gaze/score data.
  const useServerState = serverFaceState !== null;

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
    isModelLoading: false,
    browserModelFailed: false,
    aiServiceAvailable,
    facesDetected: useServerState
      ? serverFaceState.faceCount
      : faceState.faceCount,
    headPose: useServerState
      ? mapServerDirection(serverFaceState.headDirection)
      : faceState.headPose,
    gazeDirection: useServerState
      ? mapServerDirection(serverFaceState.gazeDirection)
      : faceState.gazeDirection,
    suspicionScore: useServerState
      ? serverFaceState.suspicionScore
      : faceState.suspicionScore,
    prohibitedObjects,
    riskLevel:
      prohibitedObjects.length > 0
        ? "HIGH"
        : useServerState
          ? (serverFaceState.riskLevel as "LOW" | "MEDIUM" | "HIGH")
          : faceState.riskLevel,
    debugCanvas,
    suspicionReasons: useServerState ? [] : faceState.suspicionReasons,
    abnormalDurationMs: useServerState ? 0 : faceState.abnormalDurationMs,
  };

  return state;
};
