import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  AlertTriangle,
  Shield,
  Activity,
  Clock,
  Loader,
  Eye,
  Flag,
} from "lucide-react";
import * as api from "../../lib/api";

export function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [activeExams, setActiveExams] = useState<any[]>([]);
  const [recentViolations, setRecentViolations] = useState<any[]>([]);

  const loadDashboard = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const res = await api.getAdminDashboard();
      if (res.success) {
        setStats(res.data.stats);
        setActiveExams(res.data.activeExams || []);
        setRecentViolations(res.data.recentViolations || []);
      }
    } catch (err) {
      console.error("Failed to load dashboard", err);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(true);
    const interval = setInterval(() => loadDashboard(false), 15000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  const getSeverityColor = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case "CRITICAL": return "bg-red-100 text-red-700";
      case "MEDIUM": return "bg-amber-100 text-amber-700";
      default: return "bg-blue-100 text-blue-700";
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8 text-purple-600" />
            Admin Dashboard
          </h1>
          <p className="text-slate-600 mt-1">Overview of the proctoring system</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm text-slate-600">Total Exams</span>
            </div>
            <div className="text-3xl font-bold text-slate-800">{stats?.totalExams || 0}</div>
          </div>
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm text-slate-600">Total Students</span>
            </div>
            <div className="text-3xl font-bold text-slate-800">{stats?.totalStudents || 0}</div>
          </div>
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm text-slate-600">Active Sessions</span>
            </div>
            <div className="text-3xl font-bold text-slate-800">{stats?.activeSubmissions || 0}</div>
          </div>
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Flag className="w-5 h-5 text-red-600" />
              </div>
              <span className="text-sm text-slate-600">Flagged</span>
            </div>
            <div className="text-3xl font-bold text-slate-800">{stats?.flaggedSubmissions || 0}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Active Exams */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-600" />
                Active Exams
              </h2>
            </div>
            {activeExams.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No active exam sessions</p>
            ) : (
              <div className="space-y-3">
                {activeExams.map((exam: any) => (
                  <div key={exam.examId} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <div className="font-medium text-slate-800">{exam.examTitle}</div>
                      <div className="text-sm text-slate-500">
                        {exam.studentCount} students - {exam.violationCount} violations
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/admin/monitor?examId=${exam.examId}`)}
                      className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Monitor
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Violations */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Recent Violations
              </h2>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last 24h
              </span>
            </div>
            {recentViolations.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No recent violations</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {recentViolations.map((v: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium mt-0.5 ${getSeverityColor(v.violation?.severity)}`}>
                      {v.violation?.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 text-sm">{v.studentName}</div>
                      <div className="text-xs text-slate-500">
                        {v.violation?.type?.replace(/_/g, " ")} - {v.examTitle}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      {v.violation?.timestamp ? new Date(v.violation.timestamp).toLocaleTimeString() : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="mt-8 bg-white rounded-xl shadow-md border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            System Overview
          </h2>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">{stats?.totalSubmissions || 0}</div>
              <div className="text-sm text-slate-500">Total Submissions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-800">{stats?.gradedSubmissions || 0}</div>
              <div className="text-sm text-slate-500">Graded</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">{stats?.totalViolations || 0}</div>
              <div className="text-sm text-slate-500">Total Violations</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
