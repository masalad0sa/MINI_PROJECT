import { useRef, useState, useEffect, useCallback } from "react";

interface ProctoringState {
  isModelLoading: boolean;
  facesDetected: number;
  headPose: "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";
  gazeDirection: "CENTER" | "LEFT" | "RIGHT";
  suspicionScore: number;
  prohibitedObjects: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  debugCanvas: HTMLCanvasElement | null;
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
  frameIntervalMs?: number;
  violationCooldownMs?: number;
}

const HEAD_DIRECTION_MAP: Record<string, ProctoringState["headPose"]> = {
  "HEAD TURN LEFT": "LEFT",
  "HEAD TILT LEFT": "LEFT",
  "HEAD TURN RIGHT": "RIGHT",
  "HEAD TILT RIGHT": "RIGHT",
  "HEAD UP": "UP",
  "HEAD DOWN": "DOWN",
  "HEAD STRAIGHT": "CENTER",
};

const GAZE_DIRECTION_MAP: Record<string, ProctoringState["gazeDirection"]> = {
  "LOOKING LEFT": "LEFT",
  "LOOKING RIGHT": "RIGHT",
  "LOOKING CENTER": "CENTER",
};

export const useProctoring = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onViolation?: (violation: ViolationEvent) => void,
  options: UseProctoringOptions = {},
) => {
  const apiBase =
    ((import.meta as any).env.VITE_API_BASE as string) ||
    "http://localhost:5000/api";

  const [state, setState] = useState<ProctoringState>({
    isModelLoading: false,
    facesDetected: 0,
    headPose: "CENTER",
    gazeDirection: "CENTER",
    suspicionScore: 0,
    prohibitedObjects: [],
    riskLevel: "LOW",
    debugCanvas: null,
  });

  const requestRef = useRef<number>();
  const debugCanvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const proctoringActive = useRef(true);
  const lastProcessTime = useRef<number>(0);
  const lastViolationByType = useRef<Record<string, number>>({});

  const processFrame = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState !== 4 || !proctoringActive.current) {
      requestRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = Date.now();
    const frameIntervalMs = options.frameIntervalMs ?? 1000;
    if (now - lastProcessTime.current < frameIntervalMs) {
      requestRef.current = requestAnimationFrame(processFrame);
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = 416;
      canvas.height = 312;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL("image/jpeg", 0.85);

        const examRouteId = options.examId || "live";
        const response = await fetch(`${apiBase}/proctoring/${examRouteId}/frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: imageData,
            sessionId: options.sessionId || null,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const headDirection = String(data.head_direction || "HEAD STRAIGHT");
          const gazeDirection = String(data.gaze_direction || "LOOKING CENTER");

          setState((prev) => ({
            ...prev,
            facesDetected: Number(data.face_count ?? 0),
            suspicionScore: Number(data.suspicion_score ?? 0),
            riskLevel: (data.risk_level || "LOW") as ProctoringState["riskLevel"],
            prohibitedObjects: Array.isArray(data.objects) ? data.objects : [],
            headPose: HEAD_DIRECTION_MAP[headDirection] || "CENTER",
            gazeDirection: GAZE_DIRECTION_MAP[gazeDirection] || "CENTER",
          }));

          if (data.processed_image) {
            const img = new Image();
            img.onload = () => {
              const debugCtx = debugCanvasRef.current.getContext("2d");
              if (debugCtx) {
                debugCanvasRef.current.width = img.width;
                debugCanvasRef.current.height = img.height;
                debugCtx.drawImage(img, 0, 0);
                setState((prev) => ({ ...prev, debugCanvas: debugCanvasRef.current }));
              }
            };
            img.src = data.processed_image;
          }

          const violationType = typeof data.violation_type === "string" ? data.violation_type : "";
          const shouldLog = Boolean(data.should_log_violation || data.should_notify_violation);
          if (violationType && shouldLog && onViolation) {
            const cooldownMs = options.violationCooldownMs ?? 8000;
            const lastAt = lastViolationByType.current[violationType] || 0;
            if (now - lastAt >= cooldownMs) {
              lastViolationByType.current[violationType] = now;
              const backendViolationCount =
                typeof data.backend_violation_count === "number"
                  ? data.backend_violation_count
                  : undefined;
              const violationDescription =
                typeof data?.violation_details?.description === "string"
                  ? data.violation_details.description
                  : undefined;
              const detectedObjects = Array.isArray(data?.violation_details?.objects)
                ? data.violation_details.objects.map((value: unknown) => String(value))
                : Array.isArray(data.objects)
                  ? data.objects.map((value: unknown) => String(value))
                  : [];
              onViolation({
                type: violationType,
                evidence:
                  data.processed_image ||
                  `AI Detected: ${violationType}`,
                timestamp: now,
                description: violationDescription,
                detectedObjects,
                backendLogged: Boolean(data.backend_violation_logged),
                violationCount: backendViolationCount,
                shouldAutoSubmit: Boolean(data.backend_should_auto_submit),
              });
            }
          }
        } else {
          console.warn("Backend proctoring error:", response.statusText);
        }
      }
    } catch (error) {
      console.error("Proctoring error:", error);
    }

    lastProcessTime.current = now;
    requestRef.current = requestAnimationFrame(processFrame);
  }, [
    apiBase,
    onViolation,
    options.examId,
    options.frameIntervalMs,
    options.sessionId,
    options.violationCooldownMs,
    videoRef,
  ]);

  useEffect(() => {
    proctoringActive.current = true;
    requestRef.current = requestAnimationFrame(processFrame);

    return () => {
      proctoringActive.current = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [processFrame]);

  return state;
};
