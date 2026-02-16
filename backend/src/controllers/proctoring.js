
import axios from 'axios';
import Submission from "../models/Submission.js";

// Environment variable for Python Service URL
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const AI_VIOLATION_COOLDOWN_MS = 8000;
const aiViolationCooldownCache = new Map();

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
  return [...new Set(merged.map((value) => String(value).trim()).filter(Boolean))];
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
    const { image, sessionId } = req.body;
    const resolvedSessionId =
      sessionId || `${examId || "unknown"}:${req.ip || "local"}`;

    console.log(`[Proctoring] Received frame for exam ${examId}`); // DEBUG LOG

    if (!image) {
      console.error('[Proctoring] No image data received');
      return res.status(400).json({ message: 'Image data is required' });
    }

    // Verify exam exists (optional, but good practice)
    // const exam = await Exam.findById(examId);
    // if (!exam) {
    //   return res.status(404).json({ message: 'Exam not found' });
    // }

    // Forward to Python Service
    try {
      const response = await axios.post(`${PYTHON_SERVICE_URL}/process_frame`, {
        image,
        session_id: resolvedSessionId,
        exam_id: examId || null,
      }, {
        timeout: 12000,
      });

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
        sessionId && violationType ? backendViolationLogged : shouldLogViolation;
      const shouldNotifyViolation = Boolean(violationType && shouldLogViolation);

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
      const pythonDetail =
        pythonError?.response?.data || pythonError?.message || "Unknown Python service error";
      console.error('Python Service Error:', pythonDetail);
      // Fallback or Error response
      res.status(503).json({
        message: 'AI Proctoring Service unavailable',
        error: pythonDetail,
      });
    }

  } catch (error) {
    console.error('Frame Processing Error:', error);
    res.status(500).json({ message: 'Internal server error' });
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
