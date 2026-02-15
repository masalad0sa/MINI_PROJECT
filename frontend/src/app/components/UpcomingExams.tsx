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

  // Helpers removed as formatDateTime is used in renderExamList

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

  // Tab selection state
  const [activeTab, setActiveTab] = useState<'available' | 'upcoming' | 'expired'>('available');

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

  const renderExamList = (list: UpcomingExam[], type: 'available' | 'upcoming' | 'expired') => {
    if (list.length === 0) {
      return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
             {type === 'available' ? <CheckCircle className="w-8 h-8 text-slate-400" /> :
              type === 'upcoming' ? <Clock className="w-8 h-8 text-slate-400" /> :
              <AlertCircle className="w-8 h-8 text-slate-400" />}
          </div>
          <h3 className="text-xl font-semibold text-slate-600 mb-2">
            No {type === 'available' ? 'Available' : type === 'upcoming' ? 'Upcoming' : 'Expired'} Exams
          </h3>
          <p className="text-slate-500">
            {type === 'available' ? 'Check back later for new exams.' :
             type === 'upcoming' ? 'No future exams scheduled yet.' :
             'You haven\'t missed any exams recently.'}
          </p>
        </div>
      );
    }

    return (
      <div className="grid gap-4">
        {list.map((exam) => {
          const status = getExamStatus(exam);
          return (
            <div
              key={exam._id}
              className={`bg-white rounded-xl shadow-sm border p-6 transition-all hover:shadow-md ${
                type === 'available' ? 'border-green-200 border-l-4 border-l-green-500' :
                type === 'upcoming' ? 'border-slate-200 border-l-4 border-l-blue-500' :
                'border-slate-200 border-l-4 border-l-red-400 opacity-75'
              }`}
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
                    <div className="mt-4 flex items-center gap-2 text-sm bg-slate-50 p-2 rounded w-fit">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-600 font-mono">
                         {formatDateTime(exam.scheduledStart)} - {formatDateTime(exam.scheduledEnd)}
                      </span>
                    </div>
                  </div>
                  
                  {type === 'available' && (
                    <button
                      onClick={() => handleStartExam(exam._id)}
                      className="ml-4 flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-colors shadow-sm hover:shadow"
                    >
                      <Play className="w-5 h-5" />
                      Start Exam
                    </button>
                  )}
               </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-8 min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2 flex items-center gap-3">
            <Calendar className="w-8 h-8 text-blue-600" />
            Available Exams
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

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8 bg-white p-1 rounded-xl shadow-sm border border-slate-200 w-fit">
          <button
            onClick={() => setActiveTab('available')}
            className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
              activeTab === 'available'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            Available Now
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'available' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {availableExams.length}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
              activeTab === 'upcoming'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            Upcoming
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'upcoming' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {upcomingExamsFiltered.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('expired')}
            className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
              activeTab === 'expired'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            Expired
             <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'expired' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {expiredExams.length}
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'available' && renderExamList(availableExams, 'available')}
          {activeTab === 'upcoming' && renderExamList(upcomingExamsFiltered, 'upcoming')}
          {activeTab === 'expired' && renderExamList(expiredExams, 'expired')}
        </div>
      </div>
    </div>
  );
}
