import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Camera,
  Wifi,
  User,
  CheckCircle2,
  AlertCircle,
  Loader,
} from "lucide-react";
import * as Progress from "@radix-ui/react-progress";
import { useAuth } from "../../lib/AuthContext";
import { WebcamPreview } from "./WebcamPreview";
import * as api from "../../lib/api";

export function PreExamCheck() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [webcamReady, setWebcamReady] = useState(false);
  const [internet, setInternet] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check internet connection
    const checkInternet = async () => {
      try {
        await fetch(
          import.meta.env.VITE_API_BASE + "/health",
          {
            method: "GET",
            mode: "no-cors",
          },
        );
        setInternet(true);
      } catch (err) {
        setInternet(false);
      }
    };

    checkInternet();
    const interval = setInterval(checkInternet, 5000);
    return () => clearInterval(interval);
  }, []);

  const checklistItems = [
    { label: "Webcam", status: webcamReady ? "OK" : "Pending", icon: Camera },
    { label: "Internet", status: internet ? "OK" : "Failed", icon: Wifi },
  ];

  const allChecksPassed = checklistItems.every((item) => item.status === "OK");

  const getStatusIcon = (status: string) => {
    if (status === "OK")
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (status === "Pending")
      return <Loader className="w-5 h-5 text-yellow-500 animate-spin" />;
    return <AlertCircle className="w-5 h-5 text-red-500" />;
  };

  const handleStartExam = async () => {
    if (!examId) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.startExam(examId);
      if (response.success) {
        // Navigate to active exam page
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

  const progressPercent = allChecksPassed ? 100 : webcamReady ? 75 : 50;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
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
            <WebcamPreview onReady={() => setWebcamReady(true)} />
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
            disabled={!allChecksPassed || loading}
            className={`px-8 py-4 rounded-xl font-semibold text-lg shadow-md transition-all ${
              allChecksPassed && !loading
                ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                : "bg-slate-300 text-slate-500 cursor-not-allowed"
            }`}
          >
            {loading
              ? "Starting Exam..."
              : allChecksPassed
                ? "Start Exam"
                : "Complete all checks"}
          </button>
        </div>
      </div>
    </div>
  );
}
