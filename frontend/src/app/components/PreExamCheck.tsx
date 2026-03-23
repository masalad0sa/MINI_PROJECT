import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Camera,
  Wifi,
  User,
  CheckCircle2,
  AlertCircle,
  Loader,
  ShieldCheck,
  Eye,
} from "lucide-react";
import * as Progress from "@radix-ui/react-progress";
import { useAuth } from "../../lib/AuthContext";
import { WebcamPreview } from "./WebcamPreview";
import * as api from "../../lib/api";
import { getAuthToken } from "../../lib/authStorage";

interface CalibrationBaselines {
  gaze_h_baseline: number;
  gaze_v_baseline: number;
  head_yaw_baseline: number;
  head_pitch_baseline: number;
  frames_used?: number;
}

export function PreExamCheck() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [webcamReady, setWebcamReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState<boolean | null>(null);
  const [internet, setInternet] = useState(true);
  const [aiServiceReady, setAiServiceReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Calibration state
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationDone, setCalibrationDone] = useState(false);
  const [calibrationCountdown, setCalibrationCountdown] = useState(0);
  const [calibrationBaselines, setCalibrationBaselines] =
    useState<CalibrationBaselines | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const handleWebcamReady = useCallback(() => {
    setWebcamReady(true);
  }, []);
  const handleFaceDetectionChange = useCallback((detected: boolean) => {
    setFaceDetected(detected);
  }, []);

  useEffect(() => {
    // Check internet connection
    const checkInternet = async () => {
      if (!navigator.onLine) {
        setInternet(false);
        return;
      }

      const API_BASE =
        import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
      try {
        await fetch(`${API_BASE}/health`, {
          method: "GET",
          // Removing no-cors so we actually get a proper response we can verify if needed,
          // though the backend has CORS enabled anyway.
        });
        setInternet(true);
      } catch (err) {
        setInternet(false);
      }
    };

    checkInternet();
    const interval = setInterval(checkInternet, 5000);
    return () => clearInterval(interval);
  }, []);

  // Check AI proctoring service health
  useEffect(() => {
    const API_BASE =
      import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
    const checkAI = async () => {
      try {
        const res = await fetch(`${API_BASE}/proctoring/health`);
        if (res.ok) {
          const data = await res.json();
          setAiServiceReady(data?.success === true);
        } else {
          setAiServiceReady(false);
        }
      } catch {
        setAiServiceReady(false);
      }
    };
    checkAI();
    const interval = setInterval(checkAI, 10000);
    return () => clearInterval(interval);
  }, []);

  const checklistItems: Array<{
    label: string;
    status: "OK" | "Pending" | "Failed" | "Warning";
    icon: typeof Camera;
    required: boolean;
  }> = [
    {
      label: "Webcam",
      status: webcamReady ? "OK" : "Pending",
      icon: Camera,
      required: true,
    },
    {
      label: "Face Detection",
      status: !webcamReady ? "Pending" : faceDetected ? "OK" : "Failed",
      icon: User,
      required: true,
    },
    {
      label: "Internet",
      status: internet ? "OK" : "Failed",
      icon: Wifi,
      required: true,
    },
    {
      label: "AI Proctoring",
      status:
        aiServiceReady === null ? "Pending" : aiServiceReady ? "OK" : "Failed",
      icon: ShieldCheck,
      required: true,
    },
  ];

  const allChecksPassed = checklistItems
    .filter((item) => item.required)
    .every((item) => item.status === "OK");
  const completedChecks = checklistItems.filter(
    (item) => item.status === "OK" || item.status === "Warning",
  ).length;
  const aiServiceUnavailable = aiServiceReady === false;

  // ── Gaze Calibration ──
  const startCalibration = useCallback(async () => {
    const API_BASE =
      import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
    const video = webcamVideoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setError("Webcam not ready for calibration");
      return;
    }

    setCalibrating(true);
    setCalibrationCountdown(5);
    setError("");

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    const capturedFrames: string[] = [];

    // Capture frames over 5 seconds (1 frame every ~500ms = ~10 frames)
    await new Promise<void>((resolve) => {
      let remaining = 5;
      const captureInterval = setInterval(() => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          capturedFrames.push(canvas.toDataURL("image/jpeg", 0.7));
        }
      }, 500);

      const countdownInterval = setInterval(() => {
        remaining--;
        setCalibrationCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(captureInterval);
          clearInterval(countdownInterval);
          resolve();
        }
      }, 1000);
    });

    if (capturedFrames.length < 2) {
      setCalibrating(false);
      setError("Could not capture enough frames for calibration");
      return;
    }

    // Send frames to calibration endpoint
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/proctoring/calibrate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ images: capturedFrames }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.baselines) {
          setCalibrationBaselines(data.baselines);
          setCalibrationDone(true);
        } else {
          setError("Calibration failed — could not compute baselines");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(
          errData.detail || errData.message || "Calibration service error",
        );
      }
    } catch {
      setError("Could not reach calibration service");
    } finally {
      setCalibrating(false);
    }
  }, [webcamVideoRef]);

  const getStatusIcon = (status: string) => {
    if (status === "OK")
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (status === "Pending")
      return <Loader className="w-5 h-5 text-yellow-500 animate-spin" />;
    if (status === "Warning")
      return <AlertCircle className="w-5 h-5 text-amber-500" />;
    return <AlertCircle className="w-5 h-5 text-red-500" />;
  };

  const canStartExam =
    allChecksPassed && (calibrationDone || calibrationBaselines !== null);

  const handleStartExam = async () => {
    if (!examId) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.startExam(examId);
      if (response.success) {
        // Store calibration baselines so useProctoring can send them with first frame
        if (calibrationBaselines) {
          try {
            sessionStorage.setItem(
              `calibration:${examId}`,
              JSON.stringify(calibrationBaselines),
            );
          } catch {
            // Non-critical — exam can proceed without stored calibration
          }
        }
        navigate(`/exam/${examId}`);
      } else {
        setError(response.message || "Failed to start exam");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const progressPercent = Math.round(
    (completedChecks / checklistItems.length) * 100,
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {calibrating && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[1px]">
          <div className="absolute left-1/2 top-16 -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 px-6 py-4 text-center shadow-xl">
            <p className="text-sm font-semibold text-slate-800">
              Calibration in progress
            </p>
            <p className="text-xs text-slate-600">
              Keep your head still and look at the center dot
            </p>
            <p className="mt-1 text-2xl font-bold text-indigo-700">
              {calibrationCountdown}
            </p>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative h-24 w-24">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-200/90" />
              <div className="absolute inset-0 rounded-full border-4 border-indigo-300/80 animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-4 w-4 rounded-full bg-indigo-500 shadow-[0_0_0_10px_rgba(99,102,241,0.2)]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 h-[60px] flex items-center justify-between px-8 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SP</span>
          </div>
          <span className="font-semibold text-lg">SmartProctor</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <User className="w-4 h-4" />
          <span className="text-sm">User: {user?.name || "Student"}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            System Check
          </h1>
          <p className="text-slate-600">
            Please ensure all requirements are met before starting your exam
          </p>
        </div>

        {aiServiceUnavailable && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">
                AI Proctoring Unavailable
              </h3>
              <p className="text-red-800 text-sm">
                AI proctoring service unavailable, please try again later.
              </p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Two Panel Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Webcam Preview */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
            <WebcamPreview
              videoRef={webcamVideoRef}
              onReady={handleWebcamReady}
              onFaceDetectionChange={handleFaceDetectionChange}
            />
          </div>

          {/* System Checklist */}
          <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-800 mb-6">
              System Requirements
            </h2>
            <div className="space-y-4">
              {checklistItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 transition-all hover:border-blue-300"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <item.icon className="w-5 h-5 text-slate-600" />
                    </div>
                    <span className="font-medium text-slate-700">
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(item.status)}
                    <span
                      className={`text-sm font-medium ${
                        item.status === "OK"
                          ? "text-green-600"
                          : item.status === "Pending"
                            ? "text-yellow-600"
                            : item.status === "Warning"
                              ? "text-amber-600"
                              : "text-red-600"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Gaze Calibration — shown after all basic checks pass */}
        {allChecksPassed && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-8 border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Eye className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-800">
                  Gaze Calibration
                </h2>
                <p className="text-sm text-slate-500">
                  Improves eye-tracking accuracy for your session
                </p>
              </div>
            </div>

            {calibrating ? (
              <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                <Loader className="h-5 w-5 animate-spin text-indigo-600" />
                <div>
                  <p className="text-sm font-medium text-indigo-700">
                    Hold steady while we calibrate your gaze
                  </p>
                  <p className="text-xs text-indigo-600">
                    Use the centered overlay dot for {calibrationCountdown}s
                  </p>
                </div>
              </div>
            ) : calibrationDone ? (
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <span className="text-sm font-medium text-green-700">
                    Calibration complete
                  </span>
                  <span className="text-xs text-green-600 ml-2">
                    ({calibrationBaselines?.frames_used ?? 0} frames analyzed)
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-600 mb-4">
                  This 5-second step calibrates the eye tracker to your natural
                  gaze position, reducing false alerts during the exam.
                </p>
                <button
                  onClick={startCalibration}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors cursor-pointer"
                >
                  Start Calibration
                </button>
              </div>
            )}
          </div>
        )}

        {/* Progress Bar */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-700">Setup Progress</h3>
            <span className="text-sm font-medium text-blue-600">
              {progressPercent}%
            </span>
          </div>
          <Progress.Root className="relative overflow-hidden bg-slate-200 rounded-full w-full h-3">
            <Progress.Indicator
              className="bg-gradient-to-r from-blue-500 to-blue-600 w-full h-full transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${100 - progressPercent}%)` }}
            />
          </Progress.Root>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <h3 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Important Instructions
          </h3>
          <ul className="space-y-2">
            <li className="flex items-start gap-2 text-blue-800">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
              <span>Sit in well-lit environment with clear visibility</span>
            </li>
            <li className="flex items-start gap-2 text-blue-800">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
              <span>Allow camera permission when prompted</span>
            </li>
            <li className="flex items-start gap-2 text-blue-800">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
              <span>Ensure stable internet connection throughout the exam</span>
            </li>
          </ul>
        </div>

        {/* Start Button */}
        <div className="flex justify-center">
          <button
            onClick={handleStartExam}
            disabled={!canStartExam || loading}
            className={`px-8 py-4 rounded-xl font-semibold text-lg shadow-md transition-all ${
              canStartExam && !loading
                ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                : "bg-slate-300 text-slate-500 cursor-not-allowed"
            }`}
          >
            {loading
              ? "Starting Exam..."
              : canStartExam
                ? "Start Exam"
                : aiServiceUnavailable
                  ? "AI service unavailable"
                  : allChecksPassed
                    ? "Complete calibration to continue"
                    : "Complete all checks"}
          </button>
        </div>
      </div>
    </div>
  );
}
