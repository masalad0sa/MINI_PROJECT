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

interface BrowserCalibration {
  gaze_h_baseline?: number;
  gaze_v_baseline?: number;
  head_pitch_baseline?: number;
}

interface UseFaceLandmarksOptions {
  calibration?: BrowserCalibration | null;
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

interface GazeRuntimeState {
  smoothedHRatio: number | null;
  smoothedVRatio: number | null;
  baselineHRatio: number | null;
  baselineVRatio: number | null;
  smoothedPitch: number | null;
  baselinePitch: number | null;
  lastDirection: GazeDir;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function applyCalibrationToGazeRuntime(
  runtime: GazeRuntimeState,
  calibration?: BrowserCalibration | null,
) {
  const calibratedH =
    typeof calibration?.gaze_h_baseline === "number"
      ? clamp01(calibration.gaze_h_baseline)
      : null;
  const calibratedV =
    typeof calibration?.gaze_v_baseline === "number"
      ? clamp01(calibration.gaze_v_baseline)
      : null;
  const calibratedPitch =
    typeof calibration?.head_pitch_baseline === "number"
      ? clamp(calibration.head_pitch_baseline, -0.2, 0.5)
      : null;

  runtime.baselineHRatio = calibratedH;
  runtime.baselineVRatio = calibratedV;
  runtime.smoothedHRatio = runtime.baselineHRatio;
  runtime.smoothedVRatio = runtime.baselineVRatio;
  runtime.baselinePitch = calibratedPitch;
  runtime.smoothedPitch = runtime.baselinePitch;
  runtime.lastDirection = "CENTER";
}

function computeGaze(
  landmarks: { x: number; y: number; z: number }[],
  runtime: GazeRuntimeState,
): GazeDir {
  // Ensure iris landmarks exist (indices 468-477 require refineLandmarks)
  if (landmarks.length < 478) return runtime.lastDirection;

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
    if (leftH.width < 0.01 || rightH.width < 0.01) {
      runtime.lastDirection = "CENTER";
      return "CENTER";
    }

    const rawH = clamp01((leftH.ratio + rightH.ratio) / 2);

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
    const rawV = clamp01((leftV + rightV) / 2);
    const smoothAlpha = 0.4;
    const pitchSmoothAlpha = 0.35;

    const noseTip = landmarks[1];
    const forehead = landmarks[10];
    const chin = landmarks[152];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const eyeLineY = (leftEye.y + rightEye.y) / 2;
    const faceHeight = Math.max(1e-6, chin.y - forehead.y);
    const rawPitch = (noseTip.y - eyeLineY) / faceHeight;

    if (runtime.smoothedHRatio === null) {
      runtime.smoothedHRatio = rawH;
    } else {
      runtime.smoothedHRatio =
        (1 - smoothAlpha) * runtime.smoothedHRatio + smoothAlpha * rawH;
    }

    if (runtime.baselineHRatio === null) {
      runtime.baselineHRatio = runtime.smoothedHRatio;
    } else if (
      Math.abs(runtime.smoothedHRatio - runtime.baselineHRatio) < 0.08
    ) {
      runtime.baselineHRatio =
        0.97 * runtime.baselineHRatio + 0.03 * runtime.smoothedHRatio;
    }

    if (runtime.smoothedVRatio === null) {
      runtime.smoothedVRatio = rawV;
    } else {
      runtime.smoothedVRatio =
        (1 - smoothAlpha) * runtime.smoothedVRatio + smoothAlpha * rawV;
    }

    if (runtime.smoothedPitch === null) {
      runtime.smoothedPitch = rawPitch;
    } else {
      runtime.smoothedPitch =
        (1 - pitchSmoothAlpha) * runtime.smoothedPitch +
        pitchSmoothAlpha * rawPitch;
    }

    if (runtime.baselinePitch === null) {
      runtime.baselinePitch = runtime.smoothedPitch;
    }

    const canAdaptBaseline = runtime.lastDirection === "CENTER";

    if (runtime.baselineVRatio === null) {
      runtime.baselineVRatio = runtime.smoothedVRatio;
    } else if (
      canAdaptBaseline &&
      Math.abs(runtime.smoothedVRatio - runtime.baselineVRatio) < 0.08
    ) {
      runtime.baselineVRatio =
        0.97 * runtime.baselineVRatio + 0.03 * runtime.smoothedVRatio;
    }

    if (
      canAdaptBaseline &&
      runtime.baselinePitch !== null &&
      runtime.smoothedPitch !== null &&
      Math.abs(runtime.smoothedPitch - runtime.baselinePitch) < 0.06
    ) {
      runtime.baselinePitch =
        0.98 * runtime.baselinePitch + 0.02 * runtime.smoothedPitch;
    }

    const normH = clamp01(
      runtime.smoothedHRatio - runtime.baselineHRatio + 0.5,
    );
    const normV = clamp01(
      runtime.smoothedVRatio - runtime.baselineVRatio + 0.5,
    );
    const pitchDelta =
      runtime.smoothedPitch !== null && runtime.baselinePitch !== null
        ? runtime.smoothedPitch - runtime.baselinePitch
        : 0;

    const hEnterLeft = 0.36;
    const hExitLeft = 0.44;
    const hEnterRight = 0.64;
    const hExitRight = 0.56;
    const vEnterUp = 0.4;
    const vExitUp = 0.47;
    const vEnterDown = 0.6;
    const vExitDown = 0.53;
    const pitchUpAssist = -0.045;
    const pitchDownAssist = 0.045;

    if (runtime.lastDirection === "LEFT") {
      if (normH > hExitLeft) {
        runtime.lastDirection = "CENTER";
      } else {
        return "LEFT";
      }
    } else if (runtime.lastDirection === "RIGHT") {
      if (normH < hExitRight) {
        runtime.lastDirection = "CENTER";
      } else {
        return "RIGHT";
      }
    } else if (runtime.lastDirection === "UP") {
      if (normV > vExitUp && pitchDelta > -0.03) {
        runtime.lastDirection = "CENTER";
      } else {
        return "UP";
      }
    } else if (runtime.lastDirection === "DOWN") {
      if (normV < vExitDown && pitchDelta < 0.03) {
        runtime.lastDirection = "CENTER";
      } else {
        return "DOWN";
      }
    }

    if (normH < hEnterLeft) {
      runtime.lastDirection = "LEFT";
      return "LEFT";
    }
    if (normH > hEnterRight) {
      runtime.lastDirection = "RIGHT";
      return "RIGHT";
    }
    const upByIrisOnly = normV < vEnterUp;
    const upWithPitchAssist = normV < 0.45 && pitchDelta < pitchUpAssist;
    const downByIrisOnly = normV > vEnterDown;
    const downWithPitchAssist = normV > 0.55 && pitchDelta > pitchDownAssist;

    if (upByIrisOnly || upWithPitchAssist) {
      runtime.lastDirection = "UP";
      return "UP";
    }
    if (downByIrisOnly || downWithPitchAssist) {
      runtime.lastDirection = "DOWN";
      return "DOWN";
    }

    runtime.lastDirection = "CENTER";
    return "CENTER";
  } catch {
    runtime.lastDirection = "CENTER";
    return "CENTER";
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
  options: UseFaceLandmarksOptions = {},
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
  const gazeRuntimeRef = useRef<GazeRuntimeState>({
    smoothedHRatio: null,
    smoothedVRatio: null,
    baselineHRatio: null,
    baselineVRatio: null,
    smoothedPitch: null,
    baselinePitch: null,
    lastDirection: "CENTER",
  });

  useEffect(() => {
    applyCalibrationToGazeRuntime(gazeRuntimeRef.current, options.calibration);
  }, [
    options.calibration?.gaze_h_baseline,
    options.calibration?.gaze_v_baseline,
    options.calibration?.head_pitch_baseline,
  ]);

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

    // Skip processing if model failed or not ready yet
    if (
      !landmarker ||
      !video ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      animRef.current = requestAnimationFrame(processFrame);
      return;
    }

    try {
      const results = landmarker.detectForVideo(video, performance.now());

      const faceCount = results.faceLandmarks?.length ?? 0;
      let gaze: GazeDir = "CENTER";
      let head: HeadDir = "CENTER";

      if (faceCount > 0 && results.faceLandmarks[0]) {
        const lm = results.faceLandmarks[0];
        gaze = computeGaze(lm, gazeRuntimeRef.current);
        head = computeHeadPose(lm);
      }

      const score = suspicionRef.current.update(gaze, head, faceCount);
      const risk = suspicionRef.current.getRiskLevel();

      setState({
        isLoading: false,
        modelFailed: false,
        faceCount,
        gazeDirection: gaze,
        headPose: head,
        suspicionScore: score,
        riskLevel: risk,
        suspicionReasons: suspicionRef.current.reasons,
        abnormalDurationMs: suspicionRef.current.abnormalDurationMs,
      });
    } catch (err) {
      // Log frame processing errors for debugging
      console.warn("[FaceLandmarks] Frame processing error:", err);
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
