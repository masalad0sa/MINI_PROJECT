import axios from "axios";
import Submission from "../models/Submission.js";

// Environment variable for Python Service URL
const PYTHON_SERVICE_URL =
  process.env.PYTHON_SERVICE_URL || "http://localhost:8000";
const AI_VIOLATION_COOLDOWN_MS = 8000;
const aiViolationCooldownCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const postToPythonWithRetry = async (
  endpoint,
  payload,
  {
    timeout = 8000,
    maxAttempts = 3,
    initialDelayMs = 400,
  } = {},
) => {
  let delayMs = initialDelayMs;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await axios.post(`${PYTHON_SERVICE_URL}${endpoint}`, payload, {
        timeout,
      });
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const retriable =
        !status || status >= 500 || status === 429 || status === 408;
      if (!retriable || attempt >= maxAttempts) break;
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, 2500);
    }
  }

  throw lastError;
};

const buildPythonServiceError = (error, endpointName) => {
  const status = error?.response?.status;
  const detail =
    error?.response?.data || error?.message || "Unknown Python service error";

  if (status === 404) {
    return {
      status,
      detail,
      message: `AI endpoint ${endpointName} not found on ${PYTHON_SERVICE_URL}. Ensure AI_PROCTORING/server.py is running.`,
    };
  }

  return {
    status: status ?? null,
    detail,
    message: `AI service unavailable for ${endpointName}`,
  };
};

const AI_SEVERITY_BY_TYPE = {
  PROHIBITED_OBJECT: "CRITICAL",
  MULTIPLE_FACES: "CRITICAL",
  NO_FACE: "CRITICAL",
  HIGH_SUSPICION: "MEDIUM",
  AI_FLAG: "MEDIUM",
};

const AI_DESCRIPTION_BY_TYPE = {
  PROHIBITED_OBJECT: "Prohibited object detected by AI",
  MULTIPLE_FACES: "Multiple faces detected by AI",
  NO_FACE: "No face detected by AI",
  HIGH_SUSPICION: "High suspicion behavior detected by AI",
  AI_FLAG: "Suspicious activity detected by AI",
};

const normalizeDetectedObjects = (analysisResult) => {
  const merged = [
    ...(Array.isArray(analysisResult?.objects) ? analysisResult.objects : []),
    ...(Array.isArray(analysisResult?.confirmed_objects)
      ? analysisResult.confirmed_objects
      : []),
    ...(Array.isArray(analysisResult?.high_confidence_objects)
      ? analysisResult.high_confidence_objects
      : []),
  ];
  return [
    ...new Set(merged.map((value) => String(value).trim()).filter(Boolean)),
  ];
};

const buildViolationDescription = (violationType, analysisResult) => {
  if (violationType === "PROHIBITED_OBJECT") {
    const detectedObjects = normalizeDetectedObjects(analysisResult);
    if (detectedObjects.length > 0) {
      return `Prohibited object detected by AI: ${detectedObjects.join(", ")}`;
    }
  }
  return (
    AI_DESCRIPTION_BY_TYPE[violationType] ||
    `${violationType} violation detected by AI`
  );
};

const shouldPersistAIViolation = (sessionId, violationType) => {
  const now = Date.now();
  const key = `${sessionId}:${violationType}`;
  const last = aiViolationCooldownCache.get(key) || 0;

  if (now - last < AI_VIOLATION_COOLDOWN_MS) {
    return false;
  }

  aiViolationCooldownCache.set(key, now);

  // Opportunistic cleanup to keep memory bounded.
  if (aiViolationCooldownCache.size > 5000) {
    const cutoff = now - AI_VIOLATION_COOLDOWN_MS * 2;
    for (const [cacheKey, ts] of aiViolationCooldownCache.entries()) {
      if (ts < cutoff) {
        aiViolationCooldownCache.delete(cacheKey);
      }
    }
  }

  return true;
};

const persistAIViolation = async ({
  sessionId,
  examId,
  violationType,
  evidence,
  description,
}) => {
  const submission = await Submission.findById(sessionId).select(
    "examId status controlState violations violationCount isSuspicious",
  );

  if (!submission) {
    return { logged: false, reason: "SESSION_NOT_FOUND" };
  }

  if (examId && submission.examId?.toString() !== examId.toString()) {
    return { logged: false, reason: "EXAM_MISMATCH" };
  }

  const activeStatuses = new Set(["started", "in-progress"]);
  if (!activeStatuses.has(submission.status)) {
    return { logged: false, reason: "SESSION_NOT_ACTIVE" };
  }

  if ((submission.controlState || "ACTIVE") === "PAUSED") {
    return { logged: false, reason: "SESSION_PAUSED" };
  }

  const cappedEvidence =
    typeof evidence === "string" && evidence.length > 350000
      ? evidence.slice(0, 350000)
      : evidence || "";

  submission.violations.push({
    type: violationType,
    severity: AI_SEVERITY_BY_TYPE[violationType] || "MEDIUM",
    description:
      description ||
      AI_DESCRIPTION_BY_TYPE[violationType] ||
      `${violationType} violation detected by AI`,
    evidence: cappedEvidence,
    timestamp: new Date(),
  });
  submission.violationCount = submission.violations.length;
  if (submission.violationCount >= 2) {
    submission.isSuspicious = true;
  }

  await submission.save();

  return {
    logged: true,
    violationCount: submission.violationCount,
    shouldAutoSubmit: submission.violationCount >= 3,
  };
};

export const processFrame = async (req, res) => {
  try {
    const { id: examId } = req.params;
    const { image, sessionId, calibration } = req.body;
    const objectsOnly = Boolean(req.body.objectsOnly);
    const trackingOnly = Boolean(req.body.trackingOnly);
    const includeProcessedImage = Boolean(req.body.includeProcessedImage);
    const resolvedSessionId =
      sessionId || `${examId || "unknown"}:${req.ip || "local"}`;

    if (!image) {
      console.error("[Proctoring] No image data received");
      return res.status(400).json({ message: "Image data is required" });
    }

    // Verify exam exists (optional, but good practice)
    // const exam = await Exam.findById(examId);
    // if (!exam) {
    //   return res.status(404).json({ message: 'Exam not found' });
    // }

    // Forward to Python Service
    try {
      const isRealtimeTracking = trackingOnly && !objectsOnly;
      const response = await postToPythonWithRetry(
        "/process_frame",
        {
          image,
          session_id: resolvedSessionId,
          exam_id: examId || null,
          objects_only: objectsOnly,
          tracking_only: trackingOnly,
          include_processed_image: includeProcessedImage,
          calibration: calibration || null,
        },
        {
          timeout: isRealtimeTracking ? 3500 : 12000,
          maxAttempts: isRealtimeTracking ? 1 : 3,
          initialDelayMs: isRealtimeTracking ? 0 : 500,
        },
      );

      const analysisResult = response.data;
      const violationType = analysisResult?.violation_type;
      const shouldLogViolation = Boolean(analysisResult?.should_log_violation);
      const detectedObjects = normalizeDetectedObjects(analysisResult);
      const violationDescription = violationType
        ? buildViolationDescription(violationType, analysisResult)
        : "";

      let backendViolationLogged = false;
      let backendViolationCount = null;
      let backendShouldAutoSubmit = false;
      let backendLogReason = null;

      if (sessionId && violationType && shouldLogViolation) {
        if (shouldPersistAIViolation(sessionId, violationType)) {
          const persisted = await persistAIViolation({
            sessionId,
            examId,
            violationType,
            evidence: analysisResult?.processed_image || "",
            description: violationDescription,
          });
          backendViolationLogged = persisted.logged;
          backendViolationCount =
            typeof persisted.violationCount === "number"
              ? persisted.violationCount
              : null;
          backendShouldAutoSubmit = Boolean(persisted.shouldAutoSubmit);
          backendLogReason = persisted.reason || null;
        } else {
          backendLogReason = "COOLDOWN";
        }
      }

      // Fallback for clients without session id: allow client-side logging flow.
      const effectiveShouldLogViolation =
        sessionId && violationType
          ? backendViolationLogged
          : shouldLogViolation;
      const shouldNotifyViolation = Boolean(
        violationType && shouldLogViolation,
      );

      // Return analysis to frontend
      res.json({
        ...analysisResult,
        should_log_violation: effectiveShouldLogViolation,
        should_notify_violation: shouldNotifyViolation,
        violation_details: violationType
          ? {
              type: violationType,
              description: violationDescription,
              objects: detectedObjects,
            }
          : null,
        backend_violation_logged: backendViolationLogged,
        backend_violation_count: backendViolationCount,
        backend_should_auto_submit: backendShouldAutoSubmit,
        backend_log_reason: backendLogReason,
      });
    } catch (pythonError) {
      const pythonErr = buildPythonServiceError(
        pythonError,
        "/process_frame",
      );
      console.error("Python Service Error:", pythonErr.detail);
      res.status(503).json({
        message: pythonErr.message,
        error: pythonErr.detail,
        pythonStatus: pythonErr.status,
      });
    }
  } catch (error) {
    console.error("Frame Processing Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getProctoringHealth = async (_req, res) => {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, {
      timeout: 5000,
    });

    res.status(200).json({
      success: true,
      message: "Node and Python proctoring integration is healthy",
      data: {
        node: "ok",
        python: response.data || { status: "ok" },
      },
    });
  } catch (error) {
    const pythonDetail =
      error?.response?.data || error?.message || "Unknown Python service error";
    res.status(503).json({
      success: false,
      message: "Python proctoring service is unreachable from Node",
      data: {
        node: "ok",
        python: "unreachable",
        error: pythonDetail,
      },
    });
  }
};

/**
 * Calibration endpoint — collects baseline gaze/head data while the student
 * looks at the center of the screen. Proxies to the Python /calibrate endpoint.
 */
export const calibrateGaze = async (req, res) => {
  try {
    const { images } = req.body;
    if (!Array.isArray(images) || images.length < 2) {
      return res
        .status(400)
        .json({ message: "At least 2 calibration images required" });
    }

    const response = await postToPythonWithRetry(
      "/calibrate",
      { images },
      {
        timeout: 20000,
        maxAttempts: 2,
        initialDelayMs: 600,
      },
    );

    res.json(response.data);
  } catch (error) {
    const pythonErr = buildPythonServiceError(error, "/calibrate");
    console.error("[Calibrate] Python error:", pythonErr.detail);
    res.status(503).json({
      message: pythonErr.message,
      error: pythonErr.detail,
      pythonStatus: pythonErr.status,
    });
  }
};

/**
 * Lightweight system-check endpoint for pre-exam face detection.
 * Does NOT create persistent AI session state — avoids memory leaks.
 */
export const systemCheckFrame = async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ message: "Image data is required" });
    }

    const response = await postToPythonWithRetry(
      "/system_check",
      { image },
      {
        timeout: 12000,
        maxAttempts: 3,
        initialDelayMs: 500,
      },
    );

    res.json(response.data);
  } catch (error) {
    const pythonErr = buildPythonServiceError(error, "/system_check");
    console.error("[SystemCheck] Python error:", pythonErr.detail);
    res.status(503).json({
      message: pythonErr.message,
      error: pythonErr.detail,
      pythonStatus: pythonErr.status,
    });
  }
};
