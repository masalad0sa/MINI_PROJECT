import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  User,
  Wifi,
  Monitor,
  CheckCircle,
  XCircle,
  Loader,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

const API_BASE =
  ((import.meta as any).env.VITE_API_BASE as string) ||
  "http://localhost:5000/api";

interface CheckItem {
  id: string;
  label: string;
  description: string;
  status: "pending" | "checking" | "ok" | "error";
  icon: React.ComponentType<{ className?: string }>;
}

export function SystemCheck() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const [checks, setChecks] = useState<CheckItem[]>([
    {
      id: "browser",
      label: "Browser Compatibility",
      description: "Chrome, Firefox, or Edge supported",
      status: "pending",
      icon: Monitor,
    },
    {
      id: "internet",
      label: "Internet Connection",
      description: "Stable connection required",
      status: "pending",
      icon: Wifi,
    },
    {
      id: "webcam",
      label: "Webcam Access",
      description: "Camera permission required",
      status: "pending",
      icon: Camera,
    },
    {
      id: "face",
      label: "Face Detection",
      description: "Face must be visible in frame",
      status: "pending",
      icon: User,
    },
  ]);

  const completedChecks = checks.filter((c) => c.status === "ok").length;
  const failedChecks = checks.filter((c) => c.status === "error").length;
  const progress = (completedChecks / checks.length) * 100;
  const allChecksPass = checks.every((c) => c.status === "ok");
  const hasErrors = failedChecks > 0;

  const updateCheck = useCallback((id: string, status: CheckItem["status"]) => {
    setChecks((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c))
    );
  }, []);

  const detectFaceInFrame = useCallback(async (): Promise<boolean> => {
    const video = videoRef.current;
    if (!video) return false;

    // Wait until we have video data to capture.
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise((r) => setTimeout(r, 300));
    }

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = canvas.toDataURL("image/jpeg", 0.7);

        try {
          const response = await fetch(`${API_BASE}/proctoring/system-check/frame`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image }),
          });

          if (response.ok) {
            const data = await response.json();
            const faceCount = Number(data?.face_count ?? 0);
            if (faceCount > 0) {
              return true;
            }
          }
        } catch {
          // Continue retrying; final status will be set to error.
        }
      }

      await new Promise((r) => setTimeout(r, 700));
    }

    return false;
  }, []);

  const runChecks = useCallback(async () => {
    setIsRunning(true);
    
    // Reset all to pending
    setChecks((prev) => prev.map((c) => ({ ...c, status: "pending" as const })));
    
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Check 1: Browser compatibility
    updateCheck("browser", "checking");
    await new Promise((r) => setTimeout(r, 500));
    const isModernBrowser = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
    updateCheck("browser", isModernBrowser ? "ok" : "error");

    // Check 2: Internet connection
    updateCheck("internet", "checking");
    await new Promise((r) => setTimeout(r, 500));
    updateCheck("internet", navigator.onLine ? "ok" : "error");

    // Check 3: Webcam access
    updateCheck("webcam", "checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      updateCheck("webcam", "ok");

      // Check 4: Face detection (real)
      updateCheck("face", "checking");
      const isFaceDetected = await detectFaceInFrame();
      updateCheck("face", isFaceDetected ? "ok" : "error");
    } catch {
      updateCheck("webcam", "error");
      updateCheck("face", "error");
    }

    setIsRunning(false);
  }, [detectFaceInFrame, updateCheck]);

  // Auto-run checks on mount
  useEffect(() => {
    runChecks();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [runChecks]);

  const getStatusIcon = (status: CheckItem["status"]) => {
    switch (status) {
      case "ok":
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case "error":
        return <XCircle className="w-6 h-6 text-red-500" />;
      case "checking":
        return <Loader className="w-6 h-6 text-blue-500 animate-spin" />;
      default:
        return <div className="w-6 h-6 rounded-full border-2 border-slate-300" />;
    }
  };

  const getStatusColor = (status: CheckItem["status"]) => {
    switch (status) {
      case "ok":
        return "bg-green-50 border-green-200";
      case "error":
        return "bg-red-50 border-red-200";
      case "checking":
        return "bg-blue-50 border-blue-200";
      default:
        return "bg-slate-50 border-slate-200";
    }
  };

  const getIconColor = (status: CheckItem["status"]) => {
    switch (status) {
      case "ok":
        return "bg-green-100 text-green-600";
      case "error":
        return "bg-red-100 text-red-600";
      case "checking":
        return "bg-blue-100 text-blue-600";
      default:
        return "bg-slate-100 text-slate-400";
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            Pre-Exam System Check
          </h1>
          <p className="text-slate-600">
            Verify your system meets all requirements before starting an exam
          </p>
        </div>

        {/* Progress Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-700">
                System Check Progress
              </h2>
              <p className="text-sm text-slate-500">
                {completedChecks} of {checks.length} checks passed
                {failedChecks > 0 && ` • ${failedChecks} failed`}
              </p>
            </div>
            <button
              onClick={runChecks}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? "animate-spin" : ""}`} />
              {isRunning ? "Running..." : "Re-run Checks"}
            </button>
          </div>
          
          {/* Progress Bar */}
          <div className="relative h-4 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 transition-all duration-500 rounded-full ${
                hasErrors
                  ? "bg-gradient-to-r from-red-400 to-red-500"
                  : allChecksPass
                  ? "bg-gradient-to-r from-green-400 to-green-500"
                  : "bg-gradient-to-r from-blue-400 to-blue-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-sm">
            <span className="text-slate-500">0%</span>
            <span className={`font-semibold ${
              hasErrors ? "text-red-600" : allChecksPass ? "text-green-600" : "text-blue-600"
            }`}>
              {Math.round(progress)}%
            </span>
            <span className="text-slate-500">100%</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Webcam Preview */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-slate-700 mb-4">
              Camera Preview
            </h2>
            <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              {checks.find((c) => c.id === "webcam")?.status !== "ok" && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90">
                  {checks.find((c) => c.id === "webcam")?.status === "error" ? (
                    <div className="text-center text-white">
                      <XCircle className="w-16 h-16 mx-auto mb-3 text-red-400" />
                      <p className="text-lg font-medium">Camera Access Denied</p>
                      <p className="text-sm text-slate-400 mt-1">
                        Please allow camera permissions
                      </p>
                    </div>
                  ) : checks.find((c) => c.id === "webcam")?.status === "checking" ? (
                    <div className="text-center text-white">
                      <Loader className="w-12 h-12 mx-auto mb-3 animate-spin text-blue-400" />
                      <p>Accessing camera...</p>
                    </div>
                  ) : (
                    <div className="text-center text-white">
                      <Camera className="w-12 h-12 mx-auto mb-3 text-slate-500" />
                      <p className="text-slate-400">Camera not started</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            {checks.find((c) => c.id === "face")?.status === "ok" && (
              <div className="mt-4 flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Face detected successfully</span>
              </div>
            )}
          </div>

          {/* Requirements Checklist */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-slate-700 mb-4">
              System Requirements
            </h2>
            <div className="space-y-3">
              {checks.map((check) => (
                <div
                  key={check.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${getStatusColor(check.status)}`}
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${getIconColor(check.status)}`}
                  >
                    <check.icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700">{check.label}</p>
                    <p className="text-sm text-slate-500 truncate">
                      {check.description}
                    </p>
                  </div>
                  {getStatusIcon(check.status)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Status Banner */}
        <div className="mt-8">
          {allChecksPass ? (
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 flex items-center gap-4">
              <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-green-800">
                  System Ready for Exams
                </h3>
                <p className="text-green-700">
                  All requirements are met. You can now take proctored exams.
                </p>
              </div>
              <button
                onClick={() => navigate("/dashboard")}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          ) : hasErrors ? (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-800">
                    System Requirements Not Met
                  </h3>
                  <p className="text-red-700 mb-3">
                    Please fix the following issues before taking an exam:
                  </p>
                  <ul className="space-y-1">
                    {checks
                      .filter((c) => c.status === "error")
                      .map((c) => (
                        <li key={c.id} className="flex items-center gap-2 text-red-700">
                          <XCircle className="w-4 h-4" />
                          <span>{c.label}: {c.description}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 flex items-center gap-4">
              <Loader className="w-10 h-10 text-blue-600 animate-spin flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-blue-800">
                  Checking System Requirements...
                </h3>
                <p className="text-blue-700">
                  Please wait while we verify your system.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-800 mb-2">
                Tips for a Successful System Check
              </h3>
              <ul className="space-y-1 text-amber-700 text-sm">
                <li>• Use a modern browser (Chrome, Firefox, or Edge recommended)</li>
                <li>• Ensure stable internet connection (minimum 1 Mbps)</li>
                <li>• Allow camera and microphone permissions when prompted</li>
                <li>• Sit in a well-lit environment facing the camera</li>
                <li>• Use wired headphones if possible to avoid audio issues</li>
                <li>• Close unnecessary browser tabs and applications</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
