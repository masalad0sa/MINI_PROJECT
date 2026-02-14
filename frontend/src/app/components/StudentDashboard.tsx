import {
  Home,
  History,
  User,
  Calendar,
  Clock,
  AlertCircle,
  ArrowRight,
  Loader,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import * as api from "../../lib/api";

export function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await api.getExams();
        if (res?.success) {
          setExams(res.data || []);
        } else {
          setError(res?.message || "Failed to load exams");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleStartExam = (examId: string) => {
    navigate(`/exam/${examId}/check`);
  };

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
        <nav className="flex items-center gap-6">
          <button className="flex items-center gap-2 text-blue-600 font-medium hover:text-blue-700 transition">
            <Home className="w-4 h-4" />
            <span>Home</span>
          </button>
          <button className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition">
            <History className="w-4 h-4" />
            <span>History</span>
          </button>
          <button className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition">
            <User className="w-4 h-4" />
            <span>{user?.name || "Profile"}</span>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            Welcome Back, {user?.name || "Student"}!
          </h1>
          <p className="text-slate-600">
            Manage your exams and view your performance
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

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Static Upcoming Exam Card */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200 hover:shadow-xl transition-shadow">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4">
              <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Instructions
              </h2>
            </div>
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">
                Before Starting
              </h3>
              <div className="space-y-3 mb-6 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Ensure stable internet connection</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Allow webcam and audio access</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Find a quiet, well-lit environment</span>
                </div>
              </div>
            </div>
          </div>

          {/* Past Results Card */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200 hover:shadow-xl transition-shadow">
            <div className="bg-gradient-to-br from-green-500 to-green-600 p-4">
              <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                <History className="w-5 h-5" />
                System Status
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 text-sm">Exams Taken</span>
                  <span className="text-2xl font-bold text-slate-800">
                    {exams.length}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-green-700 text-sm font-medium">
                    System: Operational
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-green-700 text-sm font-medium">
                    Connection: Stable
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Available Exams */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-4">
              <h2 className="text-white font-semibold text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Available Exams
              </h2>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="w-6 h-6 text-blue-600 animate-spin" />
                </div>
              ) : exams.length === 0 ? (
                <p className="text-slate-600 text-sm">
                  No exams available at this time.
                </p>
              ) : (
                <div className="space-y-2">
                  {exams.slice(0, 3).map((exam) => (
                    <button
                      key={exam._id}
                      onClick={() => handleStartExam(exam._id)}
                      className="w-full p-3 border border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                    >
                      <div className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                        {exam.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {exam.duration} mins • {exam.questions?.length || 0}{" "}
                        questions
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full Exams List */}
        {!loading && exams.length > 0 && (
          <div className="mt-8 bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
            <div className="bg-white border-b border-slate-200 p-6">
              <h3 className="text-xl font-bold text-slate-800">
                All Available Exams
              </h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {exams.map((exam) => (
                  <div
                    key={exam._id}
                    className="border border-slate-200 rounded-lg p-6 hover:shadow-lg hover:border-blue-500 transition-all group cursor-pointer"
                    onClick={() => handleStartExam(exam._id)}
                  >
                    <h4 className="font-bold text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">
                      {exam.title}
                    </h4>
                    <p className="text-sm text-slate-600 mb-4">
                      {exam.description || "No description"}
                    </p>
                    <div className="space-y-2 mb-4 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{exam.duration} minutes</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>Questions: {exam.questions?.length || 0}</span>
                      </div>
                    </div>
                    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 text-sm group-hover:shadow-md">
                      <span>Start Exam</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Notices Card */}
        <div className="mt-8 bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-4">
            <h2 className="text-white font-semibold text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Important Notices
            </h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-900 mb-1">
                      Face Visibility
                    </h4>
                    <p className="text-amber-800 text-sm">
                      Your face must remain visible in the camera frame
                      throughout the exam
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-900 mb-1">
                      Tab Switching
                    </h4>
                    <p className="text-amber-800 text-sm">
                      Switching tabs or windows during the exam is not allowed
                      and will be flagged
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-900 mb-1">
                      Multiple Faces
                    </h4>
                    <p className="text-amber-800 text-sm">
                      Only one person should be visible in the camera frame at
                      all times
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
