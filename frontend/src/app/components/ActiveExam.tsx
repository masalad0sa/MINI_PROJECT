import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Clock,
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Flag,
  X,
  Loader,
  ShieldAlert,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as api from "../../lib/api";
import { useBrowserSecurity, ViolationType, ViolationSeverity } from "../../hooks/useBrowserSecurity";
import { useProctoring, ViolationEvent } from "../../hooks/useProctoring";
import { WarningModal } from "./WarningModal";

export function ActiveExam() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<any>(null);

  // DEBUG: Log when exam state changes
  useEffect(() => {
    console.log("[Exam] State Updated:", exam);
  }, [exam]);

  const [sessionId, setSessionId] = useState<string>(""); // Track session ID
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [markedQuestions, setMarkedQuestions] = useState<Set<number>>(
    new Set(),
  );
  const [showWarning, setShowWarning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  
  // Webcam refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const hasAutoSubmitted = useRef(false);

  // Security violation state
  const [violationCount, setViolationCount] = useState(0);
  const [showSecurityWarning, setShowSecurityWarning] = useState(false);
  const [lastViolationType, setLastViolationType] = useState<string>("TAB_SWITCH");
  const [securityEnabled, setSecurityEnabled] = useState(false);

  // Start webcam
  useEffect(() => {
    async function startWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 320, height: 240 },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setWebcamError("Camera access denied or unavailable");
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
      console.log("[ActiveExam] Submitting exam...", { submitId, answers: formattedAnswers });
      if (!submitId) {
          console.error("[ActiveExam] No session ID found. Cannot submit.");
          alert("Critical Error: No active exam session. Submission failed.");
          setSubmitting(false);
          return;
      }
      const res = await api.submitExam(submitId, formattedAnswers);
      console.log("[ActiveExam] Submit response:", res);

      if (res?.success) {
        setResults(res.data);
        setShowResults(true);
        console.log("[ActiveExam] Exam submitted successfully, showing results.");
        
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
          alert("Submission failed: " + res?.message);
      }
    } catch (err) {
      console.error("Failed to submit exam:", err);
      alert(
        "Error submitting exam: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    } finally {
      setSubmitting(false);
    }
  }, [answers, sessionId, examId, submitting, showResults]);

  // Debounce ref to prevent spamming violations
  const lastViolationTime = useRef<number>(0);

  // Handle security violations
  const handleViolation = useCallback(async (violation: {
    type: ViolationType | string;
    severity: ViolationSeverity | string;
    description: string;
    evidence?: string;
  }) => {
    if (!sessionId || showResults || hasAutoSubmitted.current) return;

    // Check debounce (5 seconds cooldown - matches WarningModal)
    // Check debounce (5 seconds cooldown - matches WarningModal)
    // const now = Date.now();
    // if (now - lastViolationTime.current < 5000) {
    //     console.log("[ActiveExam] Violation ignored due to cooldown");
    //     return;
    // }
    const now = Date.now(); // Keep 'now' variable for later usage

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
        violation.evidence // Pass evidence image
      );

      if (res?.success) {
        lastViolationTime.current = now; // Update timestamp only on success
        setViolationCount(res.data.violationCount);
        setLastViolationType(violation.type);
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
  }, [sessionId, showResults, handleSubmit]);

  // AI Proctoring Hook
  const handleAIViolation = useCallback((event: ViolationEvent) => {
      let severity: ViolationSeverity = "MEDIUM";
      let description = "Suspicious behavior detected";
      let type = "AI_FLAG";

      switch(event.type) {
          case "MULTIPLE_FACES":
              severity = "CRITICAL";
              description = "Multiple faces detected";
              type = "MULTIPLE_FACES";
              break;
          case "PROHIBITED_OBJECT":
              severity = "CRITICAL";
              description = "Prohibited object detected (Phone/Book)";
              type = "PROHIBITED_OBJECT";
              break;
          case "NO_FACE":
              severity = "CRITICAL";
              description = "No face detected";
              type = "NO_FACE";
              break;
          case "HIGH_SUSPICION":
              description = "High suspicion score (looking away)";
              severity = "CRITICAL";
              type = "HIGH_SUSPICION";
              break;
      }

      handleViolation({
          type, 
          severity,
          description,
          evidence: event.evidence
      });
  }, [handleViolation]);

  const proctoringState = useProctoring(videoRef, handleAIViolation);

  // Attach stream to video element when it becomes available
  useEffect(() => {
    if (!loading && !proctoringState.isModelLoading && videoRef.current && streamRef.current) {
      console.log("Attaching stream to video element");
      videoRef.current.srcObject = streamRef.current;
    }
  }, [loading, proctoringState.isModelLoading]);

  useEffect(() => {
    async function loadExam() {
      try {
        console.log('[Exam] Starting exam load...');
        setLoading(true);
        // Start exam session to get sessionId
        const startRes = await api.startExam(examId || "");
        console.log("[Exam] startExam response:", startRes); // DEBUG LOG

        if (startRes?.success) {
          setSessionId(startRes.data.sessionId);
          setExam(startRes.data.exam);
          const qCount = startRes.data.exam.questions?.length || 0;
          setAnswers(new Array(qCount).fill(null));
          setTimeLeft(startRes.data.exam.duration * 60);
          setLoading(false);
        } else {
          console.error("[Exam] startExam failed:", startRes);
          setExam(null);
          setLoading(false);
          // Show error to user
          alert("Failed to start exam session. Please try again or contact support.");
          navigate("/dashboard");
        }
      } catch (err) {
        console.error("Failed to load exam:", err);
        setExam(null);
        setLoading(false);
      }
    }
    
    if (examId) {
        loadExam();
    }
  }, [examId, navigate]);


  // Browser security hook - ENABLED
  useBrowserSecurity({
    enabled: securityEnabled && !showResults && !loading,
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

  // Timer effect with auto-submit
  useEffect(() => {
    if (!exam || showResults) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
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
  }, [exam, showResults, handleSubmit]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleAnswerChange = (optionIndex: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = optionIndex;
    setAnswers(newAnswers);
  };

  const toggleMark = () => {
    const newMarked = new Set(markedQuestions);
    if (newMarked.has(currentQuestion)) {
      newMarked.delete(currentQuestion);
    } else {
      newMarked.add(currentQuestion);
    }
    setMarkedQuestions(newMarked);
  };

  const canGoNext = currentQuestion < (exam?.questions?.length || 0) - 1;
  const canGoPrev = currentQuestion > 0;

  // handleSubmit is now defined above with useCallback

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Exam Not Found
          </h2>
          <p className="text-slate-600">Unable to load exam details</p>
        </div>
      </div>
    );
  }

  const questions = exam.questions || [];
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
          return "bg-red-100 text-red-700 border-red-200";
        case "MEDIUM":
          return "bg-orange-100 text-orange-700 border-orange-200";
        default:
          return "bg-yellow-100 text-yellow-700 border-yellow-200";
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Auto-Submit Warning Banner */}
          {results?.autoSubmitted && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center gap-4">
              <ShieldAlert className="w-8 h-8 text-red-600" />
              <div>
                <h3 className="font-bold text-red-700">Auto-Submitted Due to Violations</h3>
                <p className="text-red-600 text-sm">
                  Your exam was automatically submitted due to exceeding the violation threshold.
                </p>
              </div>
            </div>
          )}

          {/* Main Results Card */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center mb-6">
              <div
                className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
                  results?.passed ? "bg-green-100" : "bg-red-100"
                }`}
              >
                <div
                  className={`text-4xl font-bold ${results?.passed ? "text-green-600" : "text-red-600"}`}
                >
                  {results?.passed ? "✓" : "✗"}
                </div>
              </div>

              <h1
                className={`text-3xl font-bold mb-1 ${results?.passed ? "text-green-600" : "text-red-600"}`}
              >
                {results?.passed ? "Exam Passed!" : "Exam Failed"}
              </h1>
              <p className="text-slate-500">{results?.examTitle || exam.title}</p>
            </div>

            {/* Score Section */}
            <div className="bg-slate-50 rounded-lg p-6 mb-6">
              <div className="text-center mb-4">
                <p className="text-slate-600 mb-1">Your Score</p>
                <p className="text-5xl font-bold text-slate-800">
                  {results?.score || 0}%
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Passing: {results?.passingScore || 50}%
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-white rounded-lg p-3">
                  <p className="text-sm text-slate-600">Correct</p>
                  <p className="text-2xl font-bold text-green-600">
                    {results?.correctCount || 0}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-sm text-slate-600">Wrong</p>
                  <p className="text-2xl font-bold text-red-600">
                    {results?.wrongCount || 0}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <p className="text-sm text-slate-600">Duration</p>
                  <p className="text-2xl font-bold text-slate-700">
                    {results?.duration ? formatDuration(results.duration) : "-"}
                  </p>
                </div>
              </div>
            </div>

            {/* Integrity Status */}
            <div className={`rounded-lg p-4 mb-6 ${
              results?.isSuspicious 
                ? "bg-red-50 border border-red-200" 
                : "bg-green-50 border border-green-200"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  results?.isSuspicious ? "bg-red-100" : "bg-green-100"
                }`}>
                  {results?.isSuspicious ? (
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                  ) : (
                    <span className="text-green-600 font-bold">✓</span>
                  )}
                </div>
                <div>
                  <h3 className={`font-semibold ${
                    results?.isSuspicious ? "text-red-700" : "text-green-700"
                  }`}>
                    {results?.isSuspicious ? "Flagged as Suspicious" : "Clean Submission"}
                  </h3>
                  <p className={`text-sm ${
                    results?.isSuspicious ? "text-red-600" : "text-green-600"
                  }`}>
                    {results?.violationCount || 0} violation(s) recorded
                  </p>
                </div>
              </div>
            </div>

            {/* Back Button */}
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
              <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
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
                      <div className="w-8 h-8 rounded-full bg-white/50 flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{getViolationLabel(violation.type)}</p>
                        <p className="text-xs opacity-75">{violation.description}</p>
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

  // Show initial loading screen
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading exam...</p>
        </div>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white h-[60px] flex items-center justify-between px-8 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="font-bold text-sm">SP</span>
          </div>
          <span className="font-semibold text-lg">{exam.title}</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg">
            <Clock className="w-4 h-4" />
            <span className="font-mono font-semibold">
              {formatTime(timeLeft)}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-green-500/30 border border-green-300/50 px-4 py-2 rounded-lg">
            <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">
              {attemptedCount}/{questions.length} Answered
            </span>
          </div>
          {/* Violation Counter */}
          {violationCount > 0 && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              violationCount >= 2 
                ? "bg-red-500/30 border border-red-300/50" 
                : "bg-yellow-500/30 border border-yellow-300/50"
            }`}>
              <ShieldAlert className="w-4 h-4" />
              <span className="text-sm font-medium">
                {violationCount}/3 Violations
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Security Warning Modal */}
      <WarningModal
        isOpen={showSecurityWarning}
        violationType={lastViolationType}
        violationCount={violationCount}
        onClose={() => {
          setShowSecurityWarning(false);
          // Do not navigate away automatically. 
          // If auto-submitted, we stay on page to show results (via handleSubmit).
        }}
      />

      {/* Main Content */}
      <div className="flex h-[calc(100vh-60px)]">
        {/* Left Panel - Question List */}
        <div className="w-[200px] bg-white border-r border-slate-200 p-4 overflow-y-auto">
          <h3 className="font-semibold text-slate-700 mb-4 text-sm">
            Questions
          </h3>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((_: any, idx: number) => (
              <button
                key={idx}
                onClick={() => setCurrentQuestion(idx)}
                className={`
                  w-8 h-8 rounded text-sm font-medium transition-all relative
                  ${
                    currentQuestion === idx
                      ? "bg-blue-600 text-white ring-2 ring-blue-300"
                      : answers[idx] !== null
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }
                `}
              >
                {idx + 1}
                {markedQuestions.has(idx) && (
                  <Flag className="w-3 h-3 text-amber-500 absolute -top-1 -right-1 fill-amber-500" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Center Panel - Question */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Webcam Feed - 50% Height Above Questions */}
          <div className="bg-slate-900 w-full relative shrink-0" style={{ height: '50vh' }}>
            {webcamError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 text-center p-4">
                <Camera className="w-8 h-8 text-slate-500 mb-2" />
                <p className="text-slate-400 text-xs">{webcamError}</p>
              </div>
            ) : (
              <>
                <video
                  ref={(el) => {
                    // Update the ref
                    (videoRef as any).current = el;
                    // Attach stream immediately if available
                    if (el && streamRef.current && !el.srcObject) {
                        console.log("[ActiveExam] Video element mounted, attaching stream directly");
                        el.srcObject = streamRef.current;
                    }
                  }}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                  style={{ transform: 'scaleX(-1)' }}
                />
                {/* Debug Canvas Overlay */}
                {proctoringState.debugCanvas && (
                  <canvas
                    ref={(el) => {
                      if (el && proctoringState.debugCanvas) {
                        el.width = proctoringState.debugCanvas.width;
                        el.height = proctoringState.debugCanvas.height;
                        const ctx = el.getContext('2d');
                        if (ctx) {
                          // Draw the canvas content normally (don't mirror)
                          // The bounding boxes are already adjusted in the hook
                          ctx.clearRect(0, 0, el.width, el.height);
                          ctx.drawImage(proctoringState.debugCanvas, 0, 0);
                        }
                      }
                    }}
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  />
                )}
              </>
            )}
            {/* AI Proctoring Overlays */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 items-end">
               <div className="flex items-center gap-2 bg-red-500/90 px-3 py-1.5 rounded-full text-sm shadow-sm">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="text-white font-bold tracking-wide">LIVE PROCTORING</span>
              </div>
              {proctoringState.isModelLoading && (
                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-sm text-white flex items-center gap-2 border border-white/10">
                  <Loader className="w-3 h-3 animate-spin" /> 
                  <span>Initializing Models...</span>
                </div>
              )}
               {!proctoringState.isModelLoading && (
                 <div className={`px-3 py-1.5 rounded-full text-sm text-white font-bold shadow-sm border border-white/10 ${
                   proctoringState.riskLevel === 'HIGH' ? 'bg-red-600' : 
                   proctoringState.riskLevel === 'MEDIUM' ? 'bg-amber-500' : 'bg-green-600'
                 }`}>
                   RISK LEVEL: {proctoringState.riskLevel}
                 </div>
               )}
            </div>
            
            {/* Proctoring Warnings */}
            {(proctoringState.suspicionScore > 0 || proctoringState.prohibitedObjects.length > 0) && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-6 py-2 rounded-full text-center border border-red-500/30 shadow-lg max-w-[90%]">
                    <p className="text-sm text-white font-medium flex items-center gap-3">
                        {proctoringState.prohibitedObjects.length > 0 && (
                          <span className="text-red-400 font-bold flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4" />
                            {proctoringState.prohibitedObjects.join(', ')} DETECTED
                          </span>
                        )}
                        {proctoringState.facesDetected !== 1 && (
                          <span className="text-yellow-400 font-bold border-l border-white/20 pl-3 ml-1">
                            {proctoringState.facesDetected} FACES VISIBLE
                          </span>
                        )}
                    </p>
                </div>
            )}
          </div>

          <div className="max-w-3xl mx-auto flex-1 p-8 w-full">
            {currentQ && (
              <div className="bg-white rounded-xl shadow-md border border-slate-200 p-8 mb-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-slate-700">
                    Question {currentQuestion + 1} of {questions.length}
                  </h2>
                  <button
                    onClick={toggleMark}
                    className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                      markedQuestions.has(currentQuestion)
                        ? "text-amber-600 hover:text-amber-700"
                        : "text-slate-600 hover:text-amber-600"
                    }`}
                  >
                    <Flag className="w-4 h-4" />
                    {markedQuestions.has(currentQuestion)
                      ? "Marked"
                      : "Mark for Review"}
                  </button>
                </div>

                <div className="mb-8">
                  <p className="text-slate-800 leading-relaxed text-lg">
                    {currentQ.questionText}
                  </p>
                </div>

                <div className="space-y-3">
                  {currentQ.options?.map((option: string, idx: number) => (
                    <label
                      key={idx}
                      className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        answers[currentQuestion] === idx
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:bg-blue-50 hover:border-blue-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="answer"
                        checked={answers[currentQuestion] === idx}
                        onChange={() => handleAnswerChange(idx)}
                        className="mt-1 w-4 h-4 text-blue-600"
                      />
                      <span className="text-slate-700">
                        <span className="font-medium mr-2 text-blue-600">
                          {String.fromCharCode(65 + idx)}.
                        </span>
                        {option}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() =>
                  canGoPrev && setCurrentQuestion(currentQuestion - 1)
                }
                disabled={!canGoPrev}
                className="flex items-center gap-2 px-6 py-3 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 rounded-lg font-medium transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>

              {currentQuestion === questions.length - 1 ? (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-8 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {submitting ? "Submitting..." : "Submit Exam"}
                </button>
              ) : (
                <button
                  onClick={() =>
                    canGoNext && setCurrentQuestion(currentQuestion + 1)
                  }
                  disabled={!canGoNext}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Monitoring */}
        <div className="w-[280px] bg-white border-l border-slate-200 p-4 overflow-y-auto">
          <h3 className="font-semibold text-slate-700 mb-4">Exam Status</h3>

          {/* Status */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-semibold text-green-800 text-sm">
                Status: Active
              </span>
            </div>
            <p className="text-green-700 text-xs">All systems operational</p>
          </div>

          {/* Progress */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="text-center mb-3">
              <div className="text-2xl font-bold text-slate-800">
                {attemptedCount}/{questions.length}
              </div>
              <div className="text-slate-600 text-xs">Answered</div>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{
                  width: `${(attemptedCount / questions.length) * 100}%`,
                }}
              ></div>
            </div>
          </div>

          {/* Guidelines */}
          <div className="mt-6 space-y-2">
            <h4 className="font-semibold text-slate-700 text-sm mb-3">
              Guidelines
            </h4>
            <div className="text-xs text-slate-600 space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                <span>Keep your face visible</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                <span>Stay in this tab</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"></div>
                <span>No external help</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Dialog */}
      <Dialog.Root open={showWarning} onOpenChange={setShowWarning}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl p-8 max-w-md w-full z-50">
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <Dialog.Title className="text-2xl font-bold text-slate-800 mb-2">
                ⚠️ WARNING ISSUED
              </Dialog.Title>
              <Dialog.Description className="text-slate-600 mb-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="font-semibold text-red-800 mb-1">
                    Violation Detected
                  </p>
                  <p className="text-red-700 text-sm">FACE NOT DETECTED</p>
                </div>
                <p className="text-sm">
                  Please ensure your face is clearly visible in the camera at
                  all times. Multiple violations may result in exam termination.
                </p>
              </Dialog.Description>
              <button
                onClick={() => setShowWarning(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                I Understand & Resume
              </button>
            </div>
            <Dialog.Close asChild>
              <button
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
