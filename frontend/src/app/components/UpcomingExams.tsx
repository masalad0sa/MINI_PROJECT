import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  Clock,
  BookOpen,
  AlertCircle,
  CheckCircle,
  Loader,
  Play,
  Timer,
  Users,
} from "lucide-react";
import * as api from "../../lib/api";

interface UpcomingExam {
  _id: string;
  title: string;
  description?: string;
  duration: number;
  totalQuestions?: number;
  passingScore: number;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
}

export function UpcomingExams() {
  const navigate = useNavigate();
  const [exams, setExams] = useState<UpcomingExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    loadExams();
    // Update current time every minute
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const loadExams = async () => {
    try {
      const res = await api.getExams();
      if (res.success) {
        setExams(res.data || res.exams || []);
      } else {
        setError(res.message || "Failed to load exams");
      }
    } catch {
      setError("Failed to load exams");
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getExamStatus = (exam: UpcomingExam) => {
    const start = new Date(exam.scheduledStart);
    const end = new Date(exam.scheduledEnd);

    if (now < start) {
      const diff = start.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      return {
        status: "upcoming",
        label: days > 0 ? `Starts in ${days}d` : `Starts in ${hours}h`,
        color: "bg-blue-100 text-blue-700",
        canStart: false,
      };
    }

    if (now >= start && now <= end) {
      const remaining = end.getTime() - now.getTime();
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      return {
        status: "available",
        label: hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`,
        color: "bg-green-100 text-green-700",
        canStart: true,
      };
    }

    return {
      status: "expired",
      label: "Expired",
      color: "bg-red-100 text-red-700",
      canStart: false,
    };
  };

  const handleStartExam = (examId: string) => {
    navigate(`/exam/${examId}/check`);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  const availableExams = exams.filter((e) => getExamStatus(e).status === "available");
  const upcomingExamsFiltered = exams.filter((e) => getExamStatus(e).status === "upcoming");
  const expiredExams = exams.filter((e) => getExamStatus(e).status === "expired");

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-blue-600" />
            Upcoming Exams
          </h1>
          <p className="text-slate-600">
            View scheduled exams and their availability windows
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Available Now */}
        {availableExams.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Available Now ({availableExams.length})
            </h2>
            <div className="grid gap-4">
              {availableExams.map((exam) => {
                const status = getExamStatus(exam);
                return (
                  <div
                    key={exam._id}
                    className="bg-white rounded-xl shadow-md border-2 border-green-200 p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold text-slate-800">
                            {exam.title}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                        {exam.description && (
                          <p className="text-slate-600 mb-4">{exam.description}</p>
                        )}
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <Timer className="w-4 h-4" />
                            {exam.duration} min
                          </span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-4 h-4" />
                            {exam.totalQuestions || "?"} questions
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            Pass: {exam.passingScore}%
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-500">
                            Window: {formatTime(exam.scheduledStart)} - {formatTime(exam.scheduledEnd)} ({formatDate(exam.scheduledStart)})
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleStartExam(exam._id)}
                        className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-colors"
                      >
                        <Play className="w-5 h-5" />
                        Start Exam
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upcoming */}
        {upcomingExamsFiltered.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Scheduled ({upcomingExamsFiltered.length})
            </h2>
            <div className="grid gap-4">
              {upcomingExamsFiltered.map((exam) => {
                const status = getExamStatus(exam);
                return (
                  <div
                    key={exam._id}
                    className="bg-white rounded-xl shadow-md border border-slate-200 p-6"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-slate-800">
                            {exam.title}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                        {exam.description && (
                          <p className="text-slate-500 text-sm mb-3">{exam.description}</p>
                        )}
                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <Timer className="w-4 h-4" />
                            {exam.duration} min
                          </span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-4 h-4" />
                            {exam.totalQuestions || "?"} questions
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-500 mb-1">Opens at</div>
                        <div className="font-semibold text-slate-800">
                          {formatDateTime(exam.scheduledStart)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Expired */}
        {expiredExams.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Expired ({expiredExams.length})
            </h2>
            <div className="grid gap-4">
              {expiredExams.map((exam) => (
                <div
                  key={exam._id}
                  className="bg-slate-50 rounded-xl border border-slate-200 p-6 opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-600">
                        {exam.title}
                      </h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Closed on {formatDateTime(exam.scheduledEnd)}
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                      Expired
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {exams.length === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-600 mb-2">
              No Exams Scheduled
            </h3>
            <p className="text-slate-500">
              Check back later for upcoming exams
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
