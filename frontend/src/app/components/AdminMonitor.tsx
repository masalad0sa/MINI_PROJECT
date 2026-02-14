import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  User,
  AlertTriangle,
  CheckCircle,
  Clock,
  Send,
  Ban,
  Camera,
  Loader,
  RefreshCw,
  Monitor,
} from "lucide-react";
import * as api from "../../lib/api";

export function AdminMonitor() {
  const [searchParams] = useSearchParams();
  const initialExamId = searchParams.get("examId") || "";

  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState(initialExamId);
  const [monitorData, setMonitorData] = useState<any>(null);
  const [selectedStudentIdx, setSelectedStudentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load available exams
  useEffect(() => {
    const loadExams = async () => {
      try {
        const res = await api.getExams();
        if (res.success) {
          setExams(res.data || res.exams || []);
          if (!selectedExamId && (res.data?.length || res.exams?.length)) {
            const examList = res.data || res.exams;
            setSelectedExamId(examList[0]._id);
          }
        }
      } catch (err) {
        console.error("Failed to load exams", err);
      } finally {
        setLoading(false);
      }
    };
    loadExams();
  }, []);

  // Load monitor data for selected exam
  const loadMonitorData = useCallback(async () => {
    if (!selectedExamId) return;
    setRefreshing(true);
    try {
      const res = await api.monitorExam(selectedExamId);
      if (res.success) {
        setMonitorData(res.data);
      }
    } catch (err) {
      console.error("Failed to load monitor data", err);
    } finally {
      setRefreshing(false);
    }
  }, [selectedExamId]);

  useEffect(() => {
    loadMonitorData();
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadMonitorData, 10000);
    return () => clearInterval(interval);
  }, [loadMonitorData]);

  const students = monitorData?.students || [];
  const violations = monitorData?.violations || [];
  const summary = monitorData?.summary || {};
  const selected = students[selectedStudentIdx];

  const getStatusIcon = (status: string) => {
    const s = status?.toLowerCase();
    if (s === "started" || s === "in-progress")
      return <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />;
    if (s === "submitted" || s === "graded")
      return <CheckCircle className="w-4 h-4 text-blue-500" />;
    if (s === "auto-submitted")
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    return <div className="w-2 h-2 rounded-full bg-slate-400" />;
  };

  const getStudentCardColor = (student: any) => {
    if (student.isSuspicious) return "bg-red-50 border-red-200";
    if (student.warningCount > 0) return "bg-amber-50 border-amber-200";
    return "bg-green-50 border-green-200";
  };

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
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Monitor className="w-5 h-5" />
          <span className="font-semibold">Live Monitor</span>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={selectedExamId}
            onChange={(e) => {
              setSelectedExamId(e.target.value);
              setSelectedStudentIdx(0);
              setMonitorData(null);
            }}
            className="bg-white/20 border border-white/30 text-white rounded-lg px-3 py-1.5 text-sm [&>option]:text-slate-800"
          >
            <option value="">Select Exam</option>
            {exams.map((exam: any) => (
              <option key={exam._id} value={exam._id}>
                {exam.title}
              </option>
            ))}
          </select>
          <button
            onClick={loadMonitorData}
            disabled={refreshing}
            className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {summary.total > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span className="bg-green-500/30 px-2 py-1 rounded">{summary.active} active</span>
              <span className="bg-blue-500/30 px-2 py-1 rounded">{summary.submitted} done</span>
              <span className="bg-red-500/30 px-2 py-1 rounded">{summary.flagged} flagged</span>
            </div>
          )}
        </div>
      </div>

      {!selectedExamId ? (
        <div className="flex-1 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <Monitor className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <p className="text-lg">Select an exam to start monitoring</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Student List */}
          <div className="w-[320px] bg-white border-r border-slate-200 overflow-y-auto">
            <div className="p-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-800">Students</h2>
              <p className="text-sm text-slate-500">{students.length} total</p>
            </div>
            <div className="p-3 space-y-2">
              {students.length === 0 ? (
                <p className="text-slate-400 text-center py-8 text-sm">No students found</p>
              ) : (
                students.map((student: any, idx: number) => (
                  <button
                    key={student.submissionId}
                    onClick={() => setSelectedStudentIdx(idx)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      selectedStudentIdx === idx
                        ? "border-purple-500 bg-purple-50 shadow-md"
                        : `border-transparent ${getStudentCardColor(student)}`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-600" />
                        <span className="font-medium text-slate-800 text-sm">{student.studentName}</span>
                      </div>
                      {getStatusIcon(student.status)}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Progress: {student.progress}%</span>
                      <span className={student.warningCount > 0 ? "text-amber-600 font-medium" : "text-green-600"}>
                        {student.warningCount} warnings
                      </span>
                    </div>
                    <div className="mt-1.5 bg-slate-200 rounded-full h-1 overflow-hidden">
                      <div className="bg-purple-500 h-full transition-all" style={{ width: `${student.progress}%` }} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right Panel */}
          <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
            {selected ? (
              <>
                {/* Student Details */}
                <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Student Details</h3>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="bg-slate-900 aspect-video rounded-lg overflow-hidden relative">
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                          <Camera className="w-12 h-12 text-slate-600" />
                        </div>
                        {(selected.status === "started" || selected.status === "in-progress") && (
                          <div className="absolute top-3 right-3 flex items-center gap-2 bg-red-500/90 px-2 py-1 rounded">
                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                            <span className="text-white text-xs font-medium">LIVE</span>
                          </div>
                        )}
                      </div>
                      <div className="text-center text-sm text-slate-500 mt-2">{selected.studentName}</div>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <div className="text-xs text-slate-500">Name</div>
                        <div className="font-semibold text-slate-800">{selected.studentName}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <div className="text-xs text-slate-500">User ID</div>
                        <div className="font-semibold text-slate-800">@{selected.studentUserId}</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <div className="text-xs text-slate-500">Progress</div>
                        <div className="font-semibold text-slate-800">{selected.progress}% Complete</div>
                      </div>
                      <div className={`rounded-lg p-3 border ${
                        selected.isSuspicious ? "bg-red-50 border-red-200" :
                        selected.warningCount > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"
                      }`}>
                        <div className="text-xs text-slate-500">Warnings</div>
                        <div className="font-semibold">{selected.warningCount} / 3</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <button className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-lg font-semibold transition-colors text-sm">
                      <Send className="w-4 h-4" />
                      Send Warning
                    </button>
                    <button className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-lg font-semibold transition-colors text-sm">
                      <Ban className="w-4 h-4" />
                      Terminate Exam
                    </button>
                  </div>
                </div>

                {/* Student's Violations */}
                {selected.violations.length > 0 && (
                  <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-3">
                      This Student's Violations ({selected.violations.length})
                    </h3>
                    <div className="space-y-2">
                      {selected.violations.map((v: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getSeverityColor(v.severity)}`}>
                            {v.severity}
                          </span>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-800">{v.type?.replace(/_/g, " ")}</div>
                            {v.description && <div className="text-xs text-slate-500">{v.description}</div>}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            {v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                Select a student to view details
              </div>
            )}

            {/* All Violations Log */}
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800">All Violation Logs</h3>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Clock className="w-4 h-4" />
                  <span>Auto-refresh: 10s</span>
                </div>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {violations.length === 0 ? (
                  <p className="text-slate-400 text-center py-4">No violations recorded</p>
                ) : (
                  violations.map((v: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-xs text-slate-400 font-mono min-w-[65px]">
                        {v.timestamp ? new Date(v.timestamp).toLocaleTimeString() : ""}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-slate-800 text-sm">{v.studentName}</div>
                        <div className="text-xs text-slate-500">{v.type?.replace(/_/g, " ")}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getSeverityColor(v.severity)}`}>
                        {v.severity}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
