import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Clock,
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Flag,
  Loader,
  ShieldAlert,
} from "lucide-react";
import * as api from "../../lib/api";
import {
  useBrowserSecurity,
  ViolationType,
  ViolationSeverity,
} from "../../hooks/useBrowserSecurity";
import { useProctoring, ViolationEvent } from "../../hooks/useProctoring";
import { WarningModal } from "./WarningModal";
import { getBuiltInCameraStream } from "../../lib/mediaPolicy";

const MAX_VIOLATIONS_BEFORE_AUTOSUBMIT = 3;
const SUSPICION_MEDIUM_THRESHOLD = 45;
const SUSPICION_HIGH_THRESHOLD = 70;

const GAZE_HORIZONTAL_THRESHOLDS = {
  leftEnter: 0.45,
  leftExit: 0.49,
  rightEnter: 0.55,
  rightExit: 0.51,
};

const GAZE_VERTICAL_THRESHOLDS = {
  upEnter: 0.34,
  upExit: 0.42,
  downEnter: 0.66,
  downExit: 0.58,
};

const HEAD_POSE_THRESHOLDS = {
  yawLeftEnter: -0.08,
  yawRightEnter: 0.08,
  yawExitAbs: 0.08,
  pitchUpEnter: -0.05,
  pitchUpExit: -0.09,
  pitchDownEnter: 0.05,
  pitchDownExit: 0.05,
  pitchBlockVerticalGazeAbs: 0.14,
};

const SHOW_PROCTOR_DEBUG =
  (import.meta as any).env.DEV ||
  String((import.meta as any).env.VITE_SHOW_PROCTOR_DEBUG || "")
    .toLowerCase()
    .trim() === "true";

const EXAM_DRAFT_PREFIX = "smartproctor_exam_draft:";

interface LocalExamDraft {
  sessionId: string;
  answers: Array<number | null>;
  markedQuestions: number[];
  currentQuestion: number;
  savedAt: number;
}

const getExamDraftKey = (examId?: string) => `${EXAM_DRAFT_PREFIX}${examId || "unknown"}`;

const readExamDraft = (examId?: string): LocalExamDraft | null => {
  if (!examId) return null;
  try {
    const raw = localStorage.getItem(getExamDraftKey(examId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalExamDraft;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.answers) || !Array.isArray(parsed.markedQuestions)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const clearExamDraft = (examId?: string) => {
  if (!examId) return;
  try {
    localStorage.removeItem(getExamDraftKey(examId));
  } catch {
    // Ignore localStorage failures
  }
};

export function ActiveExam() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<any>(null);

  const [sessionId, setSessionId] = useState<string>(""); // Track session ID
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [markedQuestions, setMarkedQuestions] = useState<Set<number>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastProgressSyncAt, setLastProgressSyncAt] = useState<number | null>(null);
  const [progressSyncError, setProgressSyncError] = useState<string | null>(null);

  // Webcam refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const hasAutoSubmitted = useRef(false);
  const progressDirtyRef = useRef(false);

  // Security violation state
  const [violationCount, setViolationCount] = useState(0);
  const [showSecurityWarning, setShowSecurityWarning] = useState(false);
  const [lastViolationType, setLastViolationType] =
    useState<string>("TAB_SWITCH");
  const [lastViolationDescription, setLastViolationDescription] =
    useState<string>("A security violation was detected.");
  const [securityEnabled, setSecurityEnabled] = useState(false);
  const [sessionControlState, setSessionControlState] = useState<
    "ACTIVE" | "PAUSED" | "TERMINATED"
  >("ACTIVE");
  const [examinerNotice, setExaminerNotice] = useState<string | null>(null);
  const [lockedByExaminer, setLockedByExaminer] = useState(false);
  const lastExaminerActionTimestamp = useRef<string>("");

  const calculateRemainingSeconds = useCallback(
    (
      durationMinutes: number,
      startedAt?: string,
      totalPausedMs = 0,
      pauseStartedAt?: string | null,
      controlState: "ACTIVE" | "PAUSED" | "TERMINATED" = "ACTIVE",
    ) => {
      if (!startedAt) return durationMinutes * 60;
      const startedMs = new Date(startedAt).getTime();
      const nowMs = Date.now();
      const activePauseMs =
        controlState === "PAUSED" && pauseStartedAt
          ? Math.max(0, nowMs - new Date(pauseStartedAt).getTime())
          : 0;
      const elapsedMs = Math.max(
        0,
        nowMs - startedMs - (totalPausedMs || 0) - activePauseMs,
      );
      const remaining = durationMinutes * 60 - Math.floor(elapsedMs / 1000);
      return Math.max(0, remaining);
    },
    [],
  );

  // Start webcam
  useEffect(() => {
    async function startWebcam() {
      try {
        const stream = await getBuiltInCameraStream({
          facingMode: "user",
          width: 320,
          height: 240,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Camera access denied or unavailable";
        setWebcamError(message);
      }
    }
    startWebcam();

    // Cleanup on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!examinerNotice) return;
    const timer = setTimeout(() => setExaminerNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [examinerNotice]);

  // Attach stream to video element when it becomes available

  // Submit handler (memoized for auto-submit) - must be before handleViolation
  const handleSubmit = useCallback(async () => {
    if (submitting || showResults) return;
    setSubmitting(true);
    try {
      const formattedAnswers = answers.map((selectedIdx, questionIdx) => ({
        questionIndex: questionIdx,
        selectedAnswer: selectedIdx !== null ? selectedIdx : undefined,
      }));

      const submitId = sessionId;
      if (!submitId) {
        console.error("[ActiveExam] No session ID found. Cannot submit.");
        setSubmitError(
          "Submission failed because no active exam session was found. Please reload this page.",
        );
        setSubmitting(false);
        return;
      }
      const res = await api.submitExam(submitId, formattedAnswers);

      if (res?.success) {
        setSubmitError(null);
        setResults(res.data);
        setShowResults(true);
        setProgressSyncError(null);
        progressDirtyRef.current = false;
        clearExamDraft(examId);

        // Stop webcam
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }
        // Exit fullscreen
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      } else {
        console.error("[ActiveExam] Submission failed:", res);
        setSubmitError(res?.message || "Submission failed. Please try again.");
      }
    } catch (err) {
      console.error("Failed to submit exam:", err);
      setSubmitError(
        `Error submitting exam: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setSubmitting(false);
    }
  }, [answers, sessionId, submitting, showResults, examId]);

  // Debounce by violation type to prevent repeated spam events.
  const lastViolationByType = useRef<Record<string, number>>({});

  // Handle security violations
  const handleViolation = useCallback(
    async (violation: {
      type: ViolationType | string;
      severity: ViolationSeverity | string;
      description: string;
      evidence?: string;
    }) => {
      if (!sessionId || showResults || hasAutoSubmitted.current) return;

      const now = Date.now();
      const violationKey = String(violation.type || "UNKNOWN");
      const cooldownMs = 8000;
      const previous = lastViolationByType.current[violationKey] || 0;
      if (now - previous < cooldownMs) {
        return;
      }

      // Map AI violation types to known types if possible, or pass string
      const type = violation.type as ViolationType;
      const severity = violation.severity as ViolationSeverity;

      try {
        // Logic: Show Warning Modal first? For now, we log but with debounce.

        const res = await api.logViolation(
          sessionId,
          type,
          severity,
          violation.description,
          violation.evidence, // Pass evidence image
        );

        if (res?.success) {
          lastViolationByType.current[violationKey] = now;
          setViolationCount(res.data.violationCount);
          setLastViolationType(violation.type);
          setLastViolationDescription(
            violation.description || "A security violation was detected.",
          );
          setShowSecurityWarning(true);

          if (res.data.shouldAutoSubmit && !hasAutoSubmitted.current) {
            console.warn("[ActiveExam] Auto-submitting due to violations...");
            hasAutoSubmitted.current = true;
            // Wait 3 seconds then submit
            setTimeout(() => handleSubmit(), 3000);
          }
        }
      } catch (err) {
        console.error("Failed to log violation:", err);
      }
    },
    [sessionId, showResults, handleSubmit],
  );

  const handleAIViolation = useCallback(
    (event: ViolationEvent) => {
      if (!sessionId || showResults || hasAutoSubmitted.current) return;

      let severity: ViolationSeverity = "MEDIUM";
      let description = "Suspicious behavior detected";
      let type = "AI_FLAG";
      const detectedObjects = Array.isArray(event.detectedObjects)
        ? event.detectedObjects.filter(
            (value) => value && value.trim().length > 0,
          )
        : [];

      switch (event.type) {
        case "MULTIPLE_FACES":
          severity = "CRITICAL";
          description = "Multiple faces detected in webcam feed";
          type = "MULTIPLE_FACES";
          break;
        case "PROHIBITED_OBJECT":
          severity = "CRITICAL";
          description =
            detectedObjects.length > 0
              ? `Prohibited object detected: ${detectedObjects.join(", ")}`
              : "Prohibited object detected in webcam feed";
          type = "PROHIBITED_OBJECT";
          break;
        case "NO_FACE":
          severity = "CRITICAL";
          description =
            "No face detected - ensure your face is visible in the camera";
          type = "NO_FACE";
          break;
        case "HIGH_SUSPICION":
          description =
            "Sustained suspicious behavior detected (looking away, head turning)";
          severity = "CRITICAL";
          type = "HIGH_SUSPICION";
          break;
      }
      if (event.description && event.description.trim().length > 0) {
        description = event.description.trim();
      }

      // Always show the warning immediately with the violation details
      setLastViolationType(type);
      setLastViolationDescription(description);

      // If backend already logged it, update count and show
      if (event.backendLogged) {
        if (typeof event.violationCount === "number") {
          setViolationCount(event.violationCount);
        }
        setShowSecurityWarning(true);

        const shouldAutoSubmit =
          event.shouldAutoSubmit ||
          (event.violationCount || 0) >= MAX_VIOLATIONS_BEFORE_AUTOSUBMIT;
        if (shouldAutoSubmit && !hasAutoSubmitted.current) {
          hasAutoSubmitted.current = true;
          setTimeout(() => handleSubmit(), 3000);
        }
        return;
      }

      // Otherwise, log to backend and show warning
      handleViolation({
        type,
        severity,
        description,
        evidence: event.evidence,
      });
    },
    [handleSubmit, handleViolation, sessionId, showResults],
  );

  const proctoringState = useProctoring(videoRef, handleAIViolation, {
    examId,
    sessionId,
    trackingIntervalMs: 120,
    objectDetectionIntervalMs: 2000,
    violationCooldownMs: 8000,
  });

  // Attach stream to video element when it becomes available
  useEffect(() => {
    if (
      !loading &&
      !proctoringState.isModelLoading &&
      videoRef.current &&
      streamRef.current
    ) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [loading, proctoringState.isModelLoading]);

  useEffect(() => {
    async function loadExam() {
      try {
        setLoading(true);
        // Start exam session to get sessionId
        const startRes = await api.startExam(examId || "");

        if (startRes?.success) {
          setPageError(null);
          setSessionId(startRes.data.sessionId);
          setExam(startRes.data.exam);
          const qCount = startRes.data.exam.questions?.length || 0;

          const baseAnswers: Array<number | null> = new Array(qCount).fill(null);
          const serverSavedAnswers = Array.isArray(startRes.data.savedAnswers)
            ? startRes.data.savedAnswers
            : [];

          serverSavedAnswers.forEach((savedAnswer: any) => {
            const questionIndex = Number(savedAnswer?.questionIndex);
            const selectedAnswer = Number(savedAnswer?.selectedAnswer);
            if (
              Number.isInteger(questionIndex) &&
              questionIndex >= 0 &&
              questionIndex < qCount &&
              Number.isInteger(selectedAnswer) &&
              selectedAnswer >= 0
            ) {
              baseAnswers[questionIndex] = selectedAnswer;
            }
          });

          const serverDraftQuestion = Number(startRes.data.draftCurrentQuestion);
          const safeServerQuestion =
            Number.isInteger(serverDraftQuestion) && serverDraftQuestion >= 0
              ? Math.min(serverDraftQuestion, Math.max(0, qCount - 1))
              : 0;
          const serverDraftMarked = Array.isArray(startRes.data.draftMarkedQuestions)
            ? startRes.data.draftMarkedQuestions
                .filter((value: any) => Number.isInteger(value) && value >= 0 && value < qCount)
                .map((value: number) => Number(value))
            : [];

          let resolvedAnswers = baseAnswers;
          let resolvedQuestion = safeServerQuestion;
          let resolvedMarked = serverDraftMarked;

          const localDraft = readExamDraft(examId);
          if (localDraft && localDraft.sessionId === startRes.data.sessionId) {
            const localAnswersValid = Array.isArray(localDraft.answers) && localDraft.answers.length === qCount;
            if (localAnswersValid) {
              resolvedAnswers = localDraft.answers.map((answer) =>
                typeof answer === "number" && answer >= 0 ? answer : null,
              );
              resolvedQuestion =
                Number.isInteger(localDraft.currentQuestion) && localDraft.currentQuestion >= 0
                  ? Math.min(localDraft.currentQuestion, Math.max(0, qCount - 1))
                  : 0;
              resolvedMarked = Array.isArray(localDraft.markedQuestions)
                ? localDraft.markedQuestions
                    .filter((value) => Number.isInteger(value) && value >= 0 && value < qCount)
                    .map((value) => Number(value))
                : [];
              setExaminerNotice("Recovered your in-progress answers from local backup.");
            }
          }

          setAnswers(resolvedAnswers);
          setCurrentQuestion(resolvedQuestion);
          setMarkedQuestions(new Set(resolvedMarked));
          setLastProgressSyncAt(null);
          setProgressSyncError(null);
          progressDirtyRef.current = false;

          const initialControlState = (startRes.data.controlState ||
            "ACTIVE") as "ACTIVE" | "PAUSED" | "TERMINATED";
          setSessionControlState(initialControlState);
          setLockedByExaminer(
            initialControlState === "PAUSED" ||
              initialControlState === "TERMINATED",
          );
          setTimeLeft(
            calculateRemainingSeconds(
              startRes.data.exam.duration,
              startRes.data.startedAt,
              startRes.data.totalPausedMs || 0,
              startRes.data.pauseStartedAt || null,
              initialControlState,
            ),
          );
          setLoading(false);
        } else {
          console.error("[Exam] startExam failed:", startRes);
          setExam(null);
          setPageError(
            startRes?.message ||
              "Failed to start exam session. Please try again or contact support.",
          );
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load exam:", err);
        setExam(null);
        setPageError(
          err instanceof Error
            ? err.message
            : "Unable to load exam details right now.",
        );
        setLoading(false);
      }
    }

    if (examId) {
      loadExam();
    }
  }, [examId, navigate, calculateRemainingSeconds]);

  // Browser security hook - ENABLED
  useBrowserSecurity({
    enabled: securityEnabled && !showResults && !loading && !lockedByExaminer,
    onViolation: handleViolation,
    onFullscreenRequest: () => {
      // Will be called when user exits fullscreen - re-request fullscreen
      if (!showResults && !loading && document.fullscreenEnabled) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    },
  });

  // Enable security after exam loads
  useEffect(() => {
    if (exam && sessionId && !loading) {
      setSecurityEnabled(true);
    }
  }, [exam, sessionId, loading]);

  // Poll examiner actions/session status and reflect changes on student UI.
  useEffect(() => {
    if (!sessionId || loading || showResults) return;

    let cancelled = false;

    const syncSessionStatus = async () => {
      try {
        const res = await api.getStudentExamSessionStatus(sessionId);
        if (!res?.success || cancelled) return;

        const data = res.data || {};
        if (typeof data.violationCount === "number") {
          setViolationCount(data.violationCount);
        }

        const controlState = (data.controlState || "ACTIVE") as
          | "ACTIVE"
          | "PAUSED"
          | "TERMINATED";
        setSessionControlState(controlState);
        setLockedByExaminer(
          controlState === "PAUSED" || controlState === "TERMINATED",
        );
        if (exam?.duration && data.startedAt) {
          setTimeLeft(
            calculateRemainingSeconds(
              exam.duration,
              data.startedAt,
              data.totalPausedMs || 0,
              data.pauseStartedAt || null,
              controlState,
            ),
          );
        }

        const latestAction = data.latestAction;
        if (
          latestAction?.timestamp &&
          latestAction.timestamp !== lastExaminerActionTimestamp.current
        ) {
          lastExaminerActionTimestamp.current = latestAction.timestamp;
          const actor = latestAction.actorName || "Examiner";
          const note = latestAction.note ? ` (${latestAction.note})` : "";

          switch (latestAction.actionType) {
            case "WARN":
              setExaminerNotice(`${actor} sent a warning${note}.`);
              break;
            case "CHAT":
              setExaminerNotice(`${actor} sent a message${note}.`);
              break;
            case "PAUSE":
              setExaminerNotice(`Exam paused by ${actor}${note}.`);
              break;
            case "RESUME":
              setExaminerNotice(`Exam resumed by ${actor}${note}.`);
              break;
            case "MARK_FALSE_POSITIVE":
              setExaminerNotice(
                `Previous flag marked false positive by ${actor}.`,
              );
              break;
            case "TERMINATE":
              setExaminerNotice(
                `Exam terminated by ${actor}${note}. Submitting...`,
              );
              if (!hasAutoSubmitted.current && !showResults) {
                hasAutoSubmitted.current = true;
                setTimeout(() => handleSubmit(), 500);
              }
              break;
            default:
              break;
          }
        }

        if (data.shouldStopExam && !hasAutoSubmitted.current && !showResults) {
          hasAutoSubmitted.current = true;
          setSessionControlState("TERMINATED");
          setLockedByExaminer(true);
          setExaminerNotice("Exam was terminated by examiner. Submitting...");
          setTimeout(() => handleSubmit(), 500);
        }
      } catch (err) {
        console.error("[ActiveExam] Failed to sync session status", err);
      }
    };

    syncSessionStatus();
    const interval = setInterval(syncSessionStatus, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    sessionId,
    loading,
    showResults,
    handleSubmit,
    exam?.duration,
    calculateRemainingSeconds,
  ]);

  // Send heartbeats so examiner can see online/offline status.
  useEffect(() => {
    if (!sessionId || loading || showResults) return;

    let cancelled = false;
    const sendHeartbeat = async () => {
      try {
        const res = await api.postStudentExamHeartbeat(sessionId);
        if (cancelled || !res?.success) return;
        const controlState = (res.data?.controlState || "ACTIVE") as
          | "ACTIVE"
          | "PAUSED"
          | "TERMINATED";
        setSessionControlState(controlState);
        setLockedByExaminer(
          controlState === "PAUSED" || controlState === "TERMINATED",
        );
      } catch (err) {
        console.error("[ActiveExam] Heartbeat failed", err);
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 12000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, loading, showResults]);

  // Timer effect with auto-submit
  useEffect(() => {
    if (!exam || showResults) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (lockedByExaminer || sessionControlState === "PAUSED") {
          return prev;
        }
        // Auto-submit when timer expires
        if (prev <= 1 && !hasAutoSubmitted.current) {
          hasAutoSubmitted.current = true;
          handleSubmit();
          return 0;
        }
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [exam, showResults, handleSubmit, lockedByExaminer, sessionControlState]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const formatOverlayMetric = (value: number | null | undefined) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "--";
    }
    return value.toFixed(3);
  };

  const handleAnswerChange = (optionIndex: number) => {
    if (lockedByExaminer) return;
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = optionIndex;
    setAnswers(newAnswers);
  };

  const toggleMark = () => {
    if (lockedByExaminer) return;
    const newMarked = new Set(markedQuestions);
    if (newMarked.has(currentQuestion)) {
      newMarked.delete(currentQuestion);
    } else {
      newMarked.add(currentQuestion);
    }
    setMarkedQuestions(newMarked);
  };

  useEffect(() => {
    if (!examId || !sessionId || loading || showResults) return;

    const draft: LocalExamDraft = {
      sessionId,
      answers,
      markedQuestions: Array.from(markedQuestions),
      currentQuestion,
      savedAt: Date.now(),
    };

    try {
      localStorage.setItem(getExamDraftKey(examId), JSON.stringify(draft));
    } catch {
      // Ignore localStorage write failures (private mode, quota, etc.)
    }

    progressDirtyRef.current = true;
  }, [
    answers,
    currentQuestion,
    markedQuestions,
    examId,
    sessionId,
    loading,
    showResults,
  ]);

  useEffect(() => {
    if (!sessionId || loading || showResults) return;

    let cancelled = false;

    const syncProgress = async () => {
      if (!progressDirtyRef.current || cancelled) return;
      progressDirtyRef.current = false;

      try {
        const res = await api.saveStudentExamProgress(
          sessionId,
          answers,
          currentQuestion,
          Array.from(markedQuestions),
        );

        if (!cancelled && res?.success) {
          setLastProgressSyncAt(Date.now());
          setProgressSyncError(null);
          return;
        }

        progressDirtyRef.current = true;
      } catch (err) {
        progressDirtyRef.current = true;
        if (!cancelled) {
          setProgressSyncError("Progress sync delayed. Retrying...");
        }
      }
    };

    syncProgress();
    const interval = setInterval(syncProgress, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    sessionId,
    answers,
    currentQuestion,
    markedQuestions,
    loading,
    showResults,
  ]);

  const canGoNext = currentQuestion < (exam?.questions?.length || 0) - 1;
  const canGoPrev = currentQuestion > 0;

  // handleSubmit is now defined above with useCallback

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-blue-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-slate-700 font-medium text-lg">Loading exam...</p>
          <p className="text-slate-500 text-sm mt-1">Preparing your session</p>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-lg">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Exam Not Found
          </h2>
          <p className="text-slate-600 mb-6">
            {pageError ||
              "Unable to load exam details. Please check your connection and try again."}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const questions = exam.questions || [];
  const questionCount = questions.length;
  const currentQ = questions[currentQuestion];
  const attemptedCount = answers.filter((a) => a !== null).length;

  if (showResults) {
    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    };

    const formatTimestamp = (timestamp: string) => {
      return new Date(timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    };

    const getViolationLabel = (type: string) => {
      const labels: Record<string, string> = {
        TAB_SWITCH: "Tab Switch",
        FULLSCREEN_EXIT: "Fullscreen Exit",
        COPY_PASTE: "Copy/Paste Attempt",
        RIGHT_CLICK: "Right Click",
        DEV_TOOLS: "Developer Tools",
        KEYBOARD_SHORTCUT: "Keyboard Shortcut",
      };
      return labels[type] || type;
    };

    const getSeverityColor = (severity: string) => {
      switch (severity) {
        case "CRITICAL":
          return "bg-red-50 text-red-700 border-red-200";
        case "MEDIUM":
          return "bg-orange-50 text-orange-700 border-orange-200";
        default:
          return "bg-yellow-50 text-yellow-700 border-yellow-200";
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4 sm:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Auto-Submit Warning Banner */}
          {results?.autoSubmitted && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-red-800">
                  Auto-Submitted Due to Violations
                </h3>
                <p className="text-red-600 text-sm">
                  Your exam was automatically submitted due to exceeding the
                  violation threshold.
                </p>
              </div>
            </div>
          )}

          {/* Main Results Card */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center mb-8">
              <div
                className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
                  results?.passed ? "bg-green-100" : "bg-red-100"
                }`}
              >
                <div
                  className={`text-4xl font-bold ${results?.passed ? "text-green-600" : "text-red-600"}`}
                >
                  {results?.passed ? "OK" : "X"}
                </div>
              </div>

              <h1
                className={`text-3xl font-bold mb-2 ${results?.passed ? "text-green-600" : "text-red-600"}`}
              >
                {results?.passed ? "Exam Passed!" : "Exam Failed"}
              </h1>
              <p className="text-slate-500">
                {results?.examTitle || exam.title}
              </p>
            </div>

            {/* Score Section */}
            <div className="bg-slate-50 rounded-lg p-6 mb-6">
              <div className="text-center mb-4">
                <p className="text-slate-600 text-sm mb-1">Your Score</p>
                <p className="text-5xl font-bold text-slate-800">
                  {results?.score || 0}
                  <span className="text-2xl text-slate-500">%</span>
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Passing: {results?.passingScore || 50}%
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs text-slate-500">Correct</p>
                  <p className="text-2xl font-bold text-green-600">
                    {results?.correctCount || 0}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-red-200">
                  <p className="text-xs text-slate-500">Wrong</p>
                  <p className="text-2xl font-bold text-red-600">
                    {results?.wrongCount || 0}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <p className="text-xs text-slate-500">Duration</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {results?.duration ? formatDuration(results.duration) : "-"}
                  </p>
                </div>
              </div>
            </div>

            {/* Integrity Status */}
            <div
              className={`rounded-lg p-4 mb-6 border ${
                results?.isSuspicious
                  ? "bg-red-50 border-red-200"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    results?.isSuspicious ? "bg-red-100" : "bg-green-100"
                  }`}
                >
                  {results?.isSuspicious ? (
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                  ) : (
                    <span className="text-green-600 font-bold">OK</span>
                  )}
                </div>
                <div>
                  <h3
                    className={`font-semibold ${results?.isSuspicious ? "text-red-800" : "text-green-800"}`}
                  >
                    {results?.isSuspicious
                      ? "Flagged as Suspicious"
                      : "Clean Submission"}
                  </h3>
                  <p
                    className={`text-sm ${results?.isSuspicious ? "text-red-600" : "text-green-600"}`}
                  >
                    {results?.violationCount || 0} violation(s) recorded
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate("/dashboard")}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              Back to Dashboard
            </button>
          </div>

          {/* Violations Timeline */}
          {results?.violations && results.violations.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Violation Timeline
              </h2>
              <div className="space-y-3">
                {results.violations.map((violation: any, index: number) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 rounded-lg border ${getSeverityColor(violation.severity)}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">
                          {getViolationLabel(violation.type)}
                        </p>
                        <p className="text-xs opacity-75">
                          {violation.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono">
                        {formatTimestamp(violation.timestamp)}
                      </span>
                      <p className="text-xs opacity-75">{violation.severity}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm min-h-[60px] flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between px-4 lg:px-6 py-3 sticky top-0 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
            <span className="font-bold text-white text-sm">SP</span>
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-slate-800 text-base lg:text-lg truncate block">
              {exam.title}
            </span>
            <span className="text-xs text-slate-500">Active Exam Session</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:gap-3">
          <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-lg">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="font-mono font-bold text-lg text-slate-800">
              {formatTime(timeLeft)}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 px-4 py-2 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-green-700">
              {attemptedCount}/{questionCount} Answered
            </span>
          </div>
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
              progressSyncError
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-slate-100 border-slate-200 text-slate-600"
            }`}
          >
            <span className="font-medium">
              {progressSyncError
                ? progressSyncError
                : lastProgressSyncAt
                  ? `Saved ${new Date(lastProgressSyncAt).toLocaleTimeString()}`
                  : "Saving draft..."}
            </span>
          </div>
          {violationCount > 0 && (
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                violationCount >= MAX_VIOLATIONS_BEFORE_AUTOSUBMIT - 1
                  ? "bg-red-50 border-red-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <ShieldAlert
                className={`w-4 h-4 ${violationCount >= MAX_VIOLATIONS_BEFORE_AUTOSUBMIT - 1 ? "text-red-600" : "text-amber-600"}`}
              />
              <span
                className={`text-sm font-medium ${violationCount >= MAX_VIOLATIONS_BEFORE_AUTOSUBMIT - 1 ? "text-red-700" : "text-amber-700"}`}
              >
                {violationCount}/{MAX_VIOLATIONS_BEFORE_AUTOSUBMIT}
              </span>
            </div>
          )}
        </div>
      </div>

      {(pageError || submitError) && (
        <div className="px-4 lg:px-6 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">
          <div className="max-w-7xl mx-auto flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {submitError || pageError}
          </div>
        </div>
      )}

      {(examinerNotice || lockedByExaminer) && (
        <div
          className={`px-4 lg:px-6 py-3 text-sm border-b flex items-center gap-2 ${
            lockedByExaminer
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-blue-50 text-blue-700 border-blue-200"
          }`}
          role="status"
          aria-live="polite"
        >
          <AlertTriangle className="w-4 h-4" />
          {examinerNotice || "Exam is currently locked by examiner action."}
        </div>
      )}

      {/* Security Warning Modal */}
      <WarningModal
        isOpen={showSecurityWarning}
        violationType={lastViolationType}
        violationDescription={lastViolationDescription}
        violationCount={violationCount}
        onClose={() => setShowSecurityWarning(false)}
      />

      {/* Main Content - Two Column Layout */}
      <div className="flex min-h-[calc(100vh-60px)] flex-col lg:flex-row">
        {/* Left Panel - Question Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {/* Proctoring Alert Banner */}
          {(proctoringState.prohibitedObjects.length > 0 ||
            proctoringState.facesDetected !== 1) && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                {proctoringState.prohibitedObjects.length > 0 && (
                  <span>
                    {proctoringState.prohibitedObjects.join(", ")}{" "}
                    detected.{" "}
                  </span>
                )}
                {proctoringState.facesDetected !== 1 && (
                  <span>{proctoringState.facesDetected} faces visible.</span>
                )}
              </p>
            </div>
          )}

          {/* Question Card */}
          <div className="max-w-3xl mx-auto">
            {currentQ && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 lg:p-8 mb-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="text-xs text-slate-500 uppercase tracking-wider">
                      Question
                    </span>
                    <h2 className="text-xl font-bold text-slate-800">
                      {Math.min(currentQuestion + 1, questionCount)}{" "}
                      <span className="text-slate-400 font-normal">
                        / {questionCount}
                      </span>
                    </h2>
                  </div>
                  <button
                    onClick={toggleMark}
                    disabled={lockedByExaminer}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      markedQuestions.has(currentQuestion)
                        ? "bg-amber-100 text-amber-700 border border-amber-300"
                        : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                    } ${lockedByExaminer ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <Flag
                      className={`w-4 h-4 ${markedQuestions.has(currentQuestion) ? "fill-amber-500" : ""}`}
                    />
                    {markedQuestions.has(currentQuestion) ? "Marked" : "Mark"}
                  </button>
                </div>

                <div className="mb-8">
                  <p className="text-slate-700 leading-relaxed text-lg">
                    {currentQ.questionText}
                  </p>
                </div>

                <div className="space-y-3">
                  {currentQ.options?.map((option: string, idx: number) => (
                    <label
                      key={idx}
                      className={`flex items-start gap-4 p-4 rounded-lg cursor-pointer transition-all border-2 ${
                        answers[currentQuestion] === idx
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                          answers[currentQuestion] === idx
                            ? "border-blue-500 bg-blue-500"
                            : "border-slate-300"
                        }`}
                      >
                        {answers[currentQuestion] === idx && (
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        )}
                      </div>
                      <input
                        type="radio"
                        name="answer"
                        checked={answers[currentQuestion] === idx}
                        disabled={lockedByExaminer}
                        onChange={() => handleAnswerChange(idx)}
                        className="sr-only"
                      />
                      <span className="text-slate-700">
                        <span className="font-semibold mr-2 text-blue-600">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        {option}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!currentQ && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 mb-6 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  No Questions Available
                </h3>
                <p className="text-sm text-slate-600">
                  This exam has no configured questions. Please contact your
                  examiner.
                </p>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() =>
                  canGoPrev && setCurrentQuestion(currentQuestion - 1)
                }
                disabled={!canGoPrev || lockedByExaminer || questionCount === 0}
                className="flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 rounded-lg font-medium transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>

              {questionCount > 0 && currentQuestion === questionCount - 1 ? (
                <button
                  onClick={handleSubmit}
                  disabled={
                    submitting || lockedByExaminer || questionCount === 0
                  }
                  className="px-8 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
                >
                  {submitting ? "Submitting..." : "Submit Exam"}
                </button>
              ) : (
                <button
                  onClick={() =>
                    canGoNext && setCurrentQuestion(currentQuestion + 1)
                  }
                  disabled={
                    !canGoNext || lockedByExaminer || questionCount === 0
                  }
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Camera, Questions, Thresholds */}
        <div className="w-full lg:w-[320px] bg-white border-t lg:border-t-0 lg:border-l border-slate-200 p-4 overflow-y-auto">
          {/* Camera Feed */}
          <div className="mb-4">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Live Camera
            </h3>
            <div className="bg-slate-900 rounded-lg overflow-hidden shadow-md">
              <div className="relative aspect-video">
                {webcamError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 text-center p-4">
                    <Camera className="w-6 h-6 text-slate-500 mb-2" />
                    <p className="text-slate-400 text-xs">{webcamError}</p>
                  </div>
                ) : (
                  <video
                    ref={(el) => {
                      (videoRef as any).current = el;
                      if (el && streamRef.current && !el.srcObject) {
                        el.srcObject = streamRef.current;
                      }
                    }}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                )}
                {/* Live Badge */}
                <div className="absolute top-2 right-2">
                  <div className="flex items-center gap-1.5 bg-red-500 px-2 py-1 rounded text-xs shadow">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                    <span className="text-white font-bold">REC</span>
                  </div>
                </div>
                {proctoringState.isModelLoading && (
                  <div className="absolute bottom-2 left-2 right-2">
                    <div className="bg-black/70 px-2 py-1 rounded text-xs text-white flex items-center gap-1.5">
                      <Loader className="w-3 h-3 animate-spin" />
                      <span>Initializing...</span>
                    </div>
                  </div>
                )}
              </div>
              {/* Status Bar */}
              <div className="px-3 py-2 bg-slate-800 flex items-center justify-between text-xs">
                <span
                  className={`font-semibold ${proctoringState.facesDetected === 1 ? "text-green-400" : "text-red-400"}`}
                >
                  {proctoringState.facesDetected} Face
                  {proctoringState.facesDetected !== 1 ? "s" : ""}
                </span>
                <span
                  className={`font-bold px-2 py-0.5 rounded ${
                    proctoringState.riskLevel === "HIGH"
                      ? "bg-red-500 text-white"
                      : proctoringState.riskLevel === "MEDIUM"
                        ? "bg-amber-500 text-white"
                        : "bg-green-500 text-white"
                  }`}
                >
                  {proctoringState.riskLevel}
                </span>
              </div>
            </div>
          </div>

          {/* Question Navigation */}
          <div className="mb-4">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm">
              Questions
            </h3>
            <div className="grid grid-cols-6 gap-1.5">
              {questions.map((_: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setCurrentQuestion(idx)}
                  className={`
                    w-full aspect-square rounded text-xs font-medium transition-all relative
                    ${
                      currentQuestion === idx
                        ? "bg-blue-600 text-white shadow-md"
                        : answers[idx] !== null
                          ? "bg-green-100 text-green-700 border border-green-300 hover:bg-green-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                    }
                  `}
                >
                  {idx + 1}
                  {markedQuestions.has(idx) && (
                    <Flag className="w-2.5 h-2.5 text-amber-500 absolute -top-0.5 -right-0.5 fill-amber-500" />
                  )}
                </button>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div>
                <span>Done</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-slate-100 border border-slate-200"></div>
                <span>Pending</span>
              </div>
              <div className="flex items-center gap-1">
                <Flag className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span>Flagged</span>
              </div>
            </div>
          </div>

          {/* Proctoring Thresholds */}
          <div className="mb-4 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Proctoring Thresholds
            </h3>
            <div className="space-y-3 text-sm">
              {/* Gaze */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-600">Gaze Direction</span>
                  <span
                    className={`font-semibold ${proctoringState.gazeDirection !== "CENTER" ? "text-amber-600" : "text-green-600"}`}
                  >
                    {proctoringState.gazeDirection}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  H L enter/exit:{" "}
                  {GAZE_HORIZONTAL_THRESHOLDS.leftEnter.toFixed(2)}/
                  {GAZE_HORIZONTAL_THRESHOLDS.leftExit.toFixed(2)} | H R
                  enter/exit: {GAZE_HORIZONTAL_THRESHOLDS.rightEnter.toFixed(2)}
                  /{GAZE_HORIZONTAL_THRESHOLDS.rightExit.toFixed(2)}
                </div>
                <div className="text-xs text-slate-400">
                  V up enter/exit: {GAZE_VERTICAL_THRESHOLDS.upEnter.toFixed(2)}
                  /{GAZE_VERTICAL_THRESHOLDS.upExit.toFixed(2)} | V down
                  enter/exit: {GAZE_VERTICAL_THRESHOLDS.downEnter.toFixed(2)}/
                  {GAZE_VERTICAL_THRESHOLDS.downExit.toFixed(2)}
                </div>
                <div className="text-xs text-blue-700 mt-0.5">
                  Current V ratio:{" "}
                  {formatOverlayMetric(proctoringState.gazeVerticalValue)}
                </div>
              </div>
              {/* Head Pose */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-600">Head Position</span>
                  <span
                    className={`font-semibold ${proctoringState.headPose !== "CENTER" ? "text-amber-600" : "text-green-600"}`}
                  >
                    {proctoringState.headPose}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Yaw left/right entry:{" "}
                  {HEAD_POSE_THRESHOLDS.yawLeftEnter.toFixed(2)} / +
                  {HEAD_POSE_THRESHOLDS.yawRightEnter.toFixed(2)}
                </div>
                <div className="text-xs text-slate-400">
                  Pitch up/down entry:{" "}
                  {HEAD_POSE_THRESHOLDS.pitchUpEnter.toFixed(2)} / +
                  {HEAD_POSE_THRESHOLDS.pitchDownEnter.toFixed(2)} | Vertical
                  gaze block at |pitch| {"\u003e="}{" "}
                  {HEAD_POSE_THRESHOLDS.pitchBlockVerticalGazeAbs.toFixed(2)}
                </div>
                <div className="text-xs text-blue-700 mt-0.5">
                  Current pitch/yaw:{" "}
                  {formatOverlayMetric(proctoringState.headPitch)} /{" "}
                  {formatOverlayMetric(proctoringState.headYaw)}
                </div>
              </div>
              {/* Suspicion Score */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-600">Suspicion Score</span>
                  <span
                    className={`font-bold ${
                      proctoringState.suspicionScore >= SUSPICION_HIGH_THRESHOLD
                        ? "text-red-600"
                        : proctoringState.suspicionScore >=
                            SUSPICION_MEDIUM_THRESHOLD
                          ? "text-amber-600"
                          : "text-green-600"
                    }`}
                  >
                    {proctoringState.suspicionScore}/100
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      proctoringState.suspicionScore >= SUSPICION_HIGH_THRESHOLD
                        ? "bg-red-500"
                        : proctoringState.suspicionScore >=
                            SUSPICION_MEDIUM_THRESHOLD
                          ? "bg-amber-500"
                          : "bg-green-500"
                    }`}
                    style={{ width: `${proctoringState.suspicionScore}%` }}
                  ></div>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Medium: {SUSPICION_MEDIUM_THRESHOLD}+ | High:{" "}
                  {SUSPICION_HIGH_THRESHOLD}+
                </div>
              </div>
              {/* Violation Count */}
              <div className="pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Violations</span>
                  <span
                    className={`font-bold ${violationCount >= MAX_VIOLATIONS_BEFORE_AUTOSUBMIT - 1 ? "text-red-600" : "text-slate-700"}`}
                  >
                    {violationCount} / {MAX_VIOLATIONS_BEFORE_AUTOSUBMIT}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Auto-submit at {MAX_VIOLATIONS_BEFORE_AUTOSUBMIT} violations
                </div>
              </div>
            </div>
          </div>

          {/* Status */}
          <div
            className={`rounded-lg p-3 border ${
              lockedByExaminer
                ? "bg-red-50 border-red-200"
                : "bg-green-50 border-green-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full animate-pulse ${lockedByExaminer ? "bg-red-500" : "bg-green-500"}`}
              ></div>
              <span
                className={`font-semibold text-sm ${lockedByExaminer ? "text-red-700" : "text-green-700"}`}
              >
                {lockedByExaminer ? "Exam Locked" : "Exam Active"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
