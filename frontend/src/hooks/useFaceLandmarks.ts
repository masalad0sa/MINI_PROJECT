import { useRef, useState, useEffect, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export interface FaceTrackingState {
  isLoading: boolean;
  /** True when both GPU and CPU delegates failed to initialise the model. */
  modelFailed: boolean;
  faceCount: number;
  gazeDirection: "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";
  headPose: "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";
  suspicionScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  suspicionReasons: string[];
  abnormalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Gaze helpers – ported from Python eye_gaze.py
// ---------------------------------------------------------------------------

function irisHorizontalRatio(
  landmarks: { x: number; y: number; z: number }[],
  leftIdx: number,
  rightIdx: number,
  irisIndices: number[],
): { ratio: number; width: number } {
  const xLeft = landmarks[leftIdx].x;
  const xRight = landmarks[rightIdx].x;
  const irisX =
    irisIndices.reduce((s, i) => s + landmarks[i].x, 0) / irisIndices.length;

  const width = Math.max(0.001, Math.abs(xRight - xLeft));
  let ratio: number;
  if (xRight >= xLeft) {
    ratio = (irisX - xLeft) / width;
  } else {
    ratio = (xLeft - irisX) / width;
  }
  return { ratio: Math.max(0, Math.min(1, ratio)), width };
}

function irisVerticalRatio(
  landmarks: { x: number; y: number; z: number }[],
  upperIdx: number,
  lowerIdx: number,
  irisIndices: number[],
): number {
  const yUpper = landmarks[upperIdx].y;
  const yLower = landmarks[lowerIdx].y;
  const irisY =
    irisIndices.reduce((s, i) => s + landmarks[i].y, 0) / irisIndices.length;

  const height = Math.max(0.001, Math.abs(yLower - yUpper));
  const ratio = (irisY - yUpper) / height;
  return Math.max(0, Math.min(1, ratio));
}

type GazeDir = FaceTrackingState["gazeDirection"];

function computeGaze(
  landmarks: { x: number; y: number; z: number }[],
  prev: GazeDir,
): GazeDir {
  // Ensure iris landmarks exist (indices 468-477 require refineLandmarks)
  if (landmarks.length < 478) return prev;

  try {
    const leftH = irisHorizontalRatio(
      landmarks,
      33,
      133,
      [468, 469, 470, 471, 472],
    );
    const rightH = irisHorizontalRatio(
      landmarks,
      362,
      263,
      [473, 474, 475, 476, 477],
    );

    // Skip if eyes too small (e.g. far from camera)
    if (leftH.width < 0.01 || rightH.width < 0.01) return prev;

    const hRatio = (leftH.ratio + rightH.ratio) / 2;

    const leftV = irisVerticalRatio(
      landmarks,
      159,
      145,
      [468, 469, 470, 471, 472],
    );
    const rightV = irisVerticalRatio(
      landmarks,
      386,
      374,
      [473, 474, 475, 476, 477],
    );
    const vRatio = (leftV + rightV) / 2;

    // Also use head pitch to supplement vertical gaze detection.
    // The iris moves very little vertically, but the head tilts noticeably.
    const noseTip = landmarks[1];
    const forehead = landmarks[10];
    const chin = landmarks[152];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const eyeLineY = (leftEye.y + rightEye.y) / 2;
    const faceHeight = Math.max(1e-6, chin.y - forehead.y);
    const headPitch = (noseTip.y - eyeLineY) / faceHeight;

    // Horizontal: iris ratio thresholds
    if (hRatio < 0.38) return "LEFT";
    if (hRatio > 0.62) return "RIGHT";

    // Vertical: combine iris ratio + head pitch for better sensitivity
    // Iris-only thresholds are tight because eye opening is very small
    const irisUp = vRatio < 0.43;
    const irisDown = vRatio > 0.57;
    // Head pitch: looking up (pitch < 0.05) or down (pitch > 0.25)
    const headUp = headPitch < 0.05;
    const headDown = headPitch > 0.25;

    if (irisUp || headUp) return "UP";
    if (irisDown || headDown) return "DOWN";

    return "CENTER";
  } catch {
    return prev;
  }
}

// ---------------------------------------------------------------------------
// Head pose helpers – ported from Python head_pose.py
// ---------------------------------------------------------------------------

type HeadDir = FaceTrackingState["headPose"];

function computeHeadPose(
  landmarks: { x: number; y: number; z: number }[],
): HeadDir {
  if (landmarks.length < 468) return "CENTER";

  try {
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const noseTip = landmarks[1];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    const dx = rightEye.x - leftEye.x;
    const eyeDist = Math.max(1e-6, Math.abs(dx));
    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    const yaw = (noseTip.x - eyeCenterX) / eyeDist;

    const eyeLineY = (leftEye.y + rightEye.y) / 2;
    const faceHeight = Math.max(1e-6, chin.y - forehead.y);
    const pitch = (noseTip.y - eyeLineY) / faceHeight;

    const dy = rightEye.y - leftEye.y;
    const roll = Math.atan2(dy, dx) * (180 / Math.PI);

    // Thresholds matching head_pose.py
    if (yaw < -0.18) return "LEFT";
    if (yaw > 0.18) return "RIGHT";
    if (pitch < 0.03) return "UP";
    if (pitch > 0.28) return "DOWN";
    if (Math.abs(roll) > 18) return roll > 0 ? "RIGHT" : "LEFT";

    return "CENTER";
  } catch {
    return "CENTER";
  }
}

// Minimum sustained abnormal duration before raising suspicion (ms)
const GRACE_PERIOD_MS = 1500;

class SuspicionTracker {
  score = 0;
  abnormalStreak = 0;
  normalStreak = 0;
  lastUpdate = Date.now();
  reasons: string[] = [];

  // Track when abnormal behavior started (for grace period)
  abnormalStartTime: number | null = null;
  abnormalDurationMs = 0;

  update(gaze: GazeDir, head: HeadDir, faceCount: number): number {
    const now = Date.now();
    const elapsed = Math.min((now - this.lastUpdate) / 1000, 0.5);
    this.lastUpdate = now;

    const gazeAbnormal = gaze !== "CENTER";
    const headAbnormal = head !== "CENTER";
    const noFace = faceCount === 0;
    const multiFace = faceCount > 1;

    const abnormal = gazeAbnormal || headAbnormal || noFace || multiFace;

    // Build reasons list
    this.reasons = [];
    if (noFace) this.reasons.push("No face visible in camera");
    if (multiFace) this.reasons.push(`${faceCount} faces detected`);
    if (gazeAbnormal)
      this.reasons.push(`Eyes looking ${gaze.replace("LOOKING ", "")}`);
    if (headAbnormal) this.reasons.push(`Head turned ${head}`);

    if (abnormal) {
      // Start or continue tracking abnormal duration
      if (this.abnormalStartTime === null) {
        this.abnormalStartTime = now;
      }
      this.abnormalDurationMs = now - this.abnormalStartTime;

      this.abnormalStreak++;
      this.normalStreak = 0;

      // Only raise score AFTER grace period (1.5s sustained)
      // Exception: no face and multiple faces trigger immediately
      const isPastGrace = this.abnormalDurationMs >= GRACE_PERIOD_MS;
      const isImmediate = noFace || multiFace;

      if (isPastGrace || isImmediate) {
        let inc = 1.2;
        if (gazeAbnormal && headAbnormal) inc += 1.0;
        if (noFace) inc += 2.0;
        if (multiFace) inc += 2.0;
        // Escalate faster for sustained violations
        if (this.abnormalDurationMs > 3000) inc += 1.5;
        if (this.abnormalDurationMs > 5000) inc += 2.0;
        this.score = Math.min(100, this.score + inc);
      }
    } else {
      // Reset abnormal tracking
      this.abnormalStartTime = null;
      this.abnormalDurationMs = 0;

      this.normalStreak++;
      this.abnormalStreak = Math.max(0, this.abnormalStreak - 1);
      const decayRate = this.normalStreak >= 2 ? 4.5 : 3.0;
      this.score = Math.max(0, this.score - decayRate * elapsed);
    }

    // Add score-level reasons
    if (this.score > 0 && this.reasons.length === 0) {
      this.reasons.push("Score decaying from previous violation");
    }

    return Math.round(this.score);
  }

  getRiskLevel(): FaceTrackingState["riskLevel"] {
    if (this.score >= 70) return "HIGH";
    if (this.score >= 45) return "MEDIUM";
    return "LOW";
  }

  reset() {
    this.score = 0;
    this.abnormalStreak = 0;
    this.normalStreak = 0;
    this.lastUpdate = Date.now();
    this.reasons = [];
    this.abnormalStartTime = null;
    this.abnormalDurationMs = 0;
  }
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function useFaceLandmarks(
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const [state, setState] = useState<FaceTrackingState>({
    isLoading: true,
    modelFailed: false,
    faceCount: 0,
    gazeDirection: "CENTER",
    headPose: "CENTER",
    suspicionScore: 0,
    riskLevel: "LOW",
    suspicionReasons: [],
    abnormalDurationMs: 0,
  });

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const animRef = useRef<number | undefined>(undefined);
  const activeRef = useRef(true);
  const suspicionRef = useRef(new SuspicionTracker());
  const lastGazeRef = useRef<GazeDir>("CENTER");

  // Initialize FaceLandmarker
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFacialTransformationMatrixes: false,
          outputFaceBlendshapes: false,
        });

        if (!cancelled) {
          landmarkerRef.current = landmarker;
          setState((s) => ({ ...s, isLoading: false, modelFailed: false }));
        }
      } catch (err) {
        console.error("[FaceLandmarks] Failed to init:", err);
        // Fallback: try CPU delegate
        try {
          const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
          );
          const landmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numFaces: 2,
            outputFacialTransformationMatrixes: false,
            outputFaceBlendshapes: false,
          });

          if (!cancelled) {
            landmarkerRef.current = landmarker;
            setState((s) => ({ ...s, isLoading: false, modelFailed: false }));
          }
        } catch (cpuErr) {
          console.error("[FaceLandmarks] CPU fallback also failed:", cpuErr);
          if (!cancelled) {
            setState((s) => ({ ...s, isLoading: false, modelFailed: true }));
          }
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  // Frame processing loop
  const processFrame = useCallback(() => {
    if (!activeRef.current) return;

    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (
      video &&
      landmarker &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      try {
        const results = landmarker.detectForVideo(video, performance.now());

        const faceCount = results.faceLandmarks?.length ?? 0;
        let gaze: GazeDir = "CENTER";
        let head: HeadDir = "CENTER";

        if (faceCount > 0 && results.faceLandmarks[0]) {
          const lm = results.faceLandmarks[0];
          gaze = computeGaze(lm, lastGazeRef.current);
          lastGazeRef.current = gaze;
          head = computeHeadPose(lm);
        }

        const score = suspicionRef.current.update(gaze, head, faceCount);
        const risk = suspicionRef.current.getRiskLevel();

        setState({
          isLoading: false,
          faceCount,
          gazeDirection: gaze,
          headPose: head,
          suspicionScore: score,
          riskLevel: risk,
          suspicionReasons: suspicionRef.current.reasons,
          abnormalDurationMs: suspicionRef.current.abnormalDurationMs,
        });
      } catch (err) {
        // Silently continue on frame errors
      }
    }

    animRef.current = requestAnimationFrame(processFrame);
  }, [videoRef]);

  useEffect(() => {
    activeRef.current = true;
    animRef.current = requestAnimationFrame(processFrame);

    return () => {
      activeRef.current = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [processFrame]);

  return state;
}
