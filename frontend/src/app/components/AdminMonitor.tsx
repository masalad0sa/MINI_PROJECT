import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  User,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Flag,
  ShieldCheck,
  ShieldAlert,
  MessageSquareWarning,
  Camera,
  Loader,
  RefreshCw,
  Monitor,
  ExternalLink,
} from "lucide-react";
import * as api from "../../lib/api";

export function AdminMonitor() {
  const [searchParams] = useSearchParams();
  const initialExamId = searchParams.get("examId") || "";

  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState(initialExamId);
  const [monitorData, setMonitorData] = useState<any>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [riskFilter, setRiskFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string>("");

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
      const res = await api.getExaminerMonitor(selectedExamId);
      if (res.success) {
        setMonitorData(res.data);
        setSelectedStudentId((prev) => {
          if (!prev) return res.data?.students?.[0]?.submissionId || "";
          const stillExists = (res.data?.students || []).some(
            (student: any) => student.submissionId === prev,
          );
          return stillExists ? prev : res.data?.students?.[0]?.submissionId || "";
        });
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
  const selected =
    students.find((student: any) => student.submissionId === selectedStudentId) ||
    students[0] ||
    null;

  const queueRankMap = useMemo(() => {
    const rankMap = new Map<string, number>();
    (monitorData?.riskQueue || []).forEach((queueItem: any, idx: number) => {
      rankMap.set(queueItem.submissionId, queueItem.rank || idx + 1);
    });
    return rankMap;
  }, [monitorData?.riskQueue]);

  const filteredStudents =
    riskFilter === "ALL"
      ? students
      : students.filter((student: any) => student.riskLevel === riskFilter);

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

  const getRiskBadge = (riskLevel: string) => {
    if (riskLevel === "HIGH") return "bg-red-100 text-red-700 border-red-200";
    if (riskLevel === "MEDIUM") return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-green-100 text-green-700 border-green-200";
  };

  const getReviewStatusBadge = (reviewStatus: string) => {
    switch (reviewStatus) {
      case "ESCALATED":
        return "bg-red-100 text-red-700 border-red-200";
      case "UNDER_REVIEW":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "RESOLVED":
        return "bg-green-100 text-green-700 border-green-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case "CRITICAL": return "bg-red-100 text-red-700";
      case "MEDIUM": return "bg-amber-100 text-amber-700";
      default: return "bg-blue-100 text-blue-700";
    }
  };

  const toReadableLabel = (value: string) => value?.replace(/_/g, " ") || "";

  const performAction = async (
    actionType:
      | "WARN"
      | "CHAT"
      | "PAUSE"
      | "TERMINATE"
      | "MARK_FALSE_POSITIVE"
      | "ESCALATE"
      | "RESOLVE",
  ) => {
    if (!selected?.submissionId) return;

    const requiresNote = new Set(["WARN", "TERMINATE", "ESCALATE", "MARK_FALSE_POSITIVE"]);
    const note = requiresNote.has(actionType)
      ? window.prompt(`Add a note for ${toReadableLabel(actionType).toLowerCase()}:`) || ""
      : "";

    setActionLoading(actionType);
    setActionMessage("");
    try {
      const res = await api.takeExaminerSubmissionAction(
        selected.submissionId,
        actionType,
        note,
      );
      if (res.success) {
        setActionMessage(`${toReadableLabel(actionType)} recorded for ${selected.studentName}.`);
        await loadMonitorData();
      } else {
        setActionMessage(`Failed to apply ${toReadableLabel(actionType)}.`);
      }
    } catch (err) {
      console.error("Failed to apply submission action", err);
      setActionMessage(`Failed to apply ${toReadableLabel(actionType)}.`);
    } finally {
      setActionLoading(null);
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
              setSelectedStudentId("");
              setMonitorData(null);
              setActionMessage("");
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
              <span className="bg-red-500/30 px-2 py-1 rounded">{summary.highRisk || 0} high risk</span>
              <span className="bg-amber-500/30 px-2 py-1 rounded">{summary.mediumRisk || 0} medium risk</span>
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
              <h2 className="font-semibold text-slate-800">Live Risk Queue</h2>
              <p className="text-sm text-slate-500">{students.length} total students</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((filterValue) => (
                  <button
                    key={filterValue}
                    onClick={() => setRiskFilter(filterValue)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      riskFilter === filterValue
                        ? "bg-purple-100 text-purple-700 border-purple-300"
                        : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                    }`}
                  >
                    {filterValue}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 space-y-2">
              {filteredStudents.length === 0 ? (
                <p className="text-slate-400 text-center py-8 text-sm">No students found</p>
              ) : (
                filteredStudents.map((student: any) => (
                  <button
                    key={student.submissionId}
                    onClick={() => setSelectedStudentId(student.submissionId)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      selectedStudentId === student.submissionId
                        ? "border-purple-500 bg-purple-50 shadow-md"
                        : "border-slate-200 hover:border-purple-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-purple-700 bg-purple-100 rounded px-1.5 py-0.5">
                          #{queueRankMap.get(student.submissionId) || "-"}
                        </span>
                        <User className="w-4 h-4 text-slate-600" />
                        <span className="font-medium text-slate-800 text-sm">{student.studentName}</span>
                      </div>
                      {getStatusIcon(student.status)}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className={`px-2 py-0.5 rounded-full border ${getRiskBadge(student.riskLevel)}`}>
                        {student.riskLevel} · {student.riskScore}/100
                      </span>
                      <span className="text-slate-600 font-medium">
                        {student.warningCount} warnings
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                      <span>{student.lastAlertAt ? `Last alert ${new Date(student.lastAlertAt).toLocaleTimeString()}` : "No alerts yet"}</span>
                      <span>{student.evidenceCount || 0} evidence</span>
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
                    <div className="space-y-2.5">
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
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg p-3 border bg-slate-50 border-slate-200">
                          <div className="text-xs text-slate-500">Risk</div>
                          <div className={`font-semibold inline-flex px-2 py-0.5 mt-1 rounded-full border text-xs ${getRiskBadge(selected.riskLevel)}`}>
                            {selected.riskLevel} · {selected.riskScore}/100
                          </div>
                        </div>
                        <div className="rounded-lg p-3 border bg-slate-50 border-slate-200">
                          <div className="text-xs text-slate-500">Review</div>
                          <div className={`font-semibold inline-flex px-2 py-0.5 mt-1 rounded-full border text-xs ${getReviewStatusBadge(selected.reviewStatus)}`}>
                            {toReadableLabel(selected.reviewStatus)}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg p-3 border bg-slate-50 border-slate-200">
                        <div className="text-xs text-slate-500">Alerts / Evidence</div>
                        <div className="font-semibold text-slate-800">
                          {selected.warningCount} warnings · {selected.evidenceCount || 0} evidence files
                        </div>
                      </div>
                      <div className="rounded-lg p-3 border bg-slate-50 border-slate-200">
                        <div className="text-xs text-slate-500">Last Alert</div>
                        <div className="font-semibold text-slate-800">
                          {selected.lastAlertAt ? new Date(selected.lastAlertAt).toLocaleString() : "N/A"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                    <button
                      onClick={() => performAction("WARN")}
                      disabled={!!actionLoading}
                      className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-lg font-semibold transition-colors text-sm disabled:opacity-60"
                    >
                      <MessageSquareWarning className="w-4 h-4" />
                      {actionLoading === "WARN" ? "Applying..." : "Warn"}
                    </button>
                    <button
                      onClick={() => performAction("ESCALATE")}
                      disabled={!!actionLoading}
                      className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold transition-colors text-sm disabled:opacity-60"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      {actionLoading === "ESCALATE" ? "Applying..." : "Escalate"}
                    </button>
                    <button
                      onClick={() => performAction("RESOLVE")}
                      disabled={!!actionLoading}
                      className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-semibold transition-colors text-sm disabled:opacity-60"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      {actionLoading === "RESOLVE" ? "Applying..." : "Resolve"}
                    </button>
                    <button
                      onClick={() => performAction("MARK_FALSE_POSITIVE")}
                      disabled={!!actionLoading}
                      className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white py-2.5 rounded-lg font-semibold transition-colors text-sm disabled:opacity-60"
                    >
                      <Flag className="w-4 h-4" />
                      {actionLoading === "MARK_FALSE_POSITIVE" ? "Applying..." : "False Positive"}
                    </button>
                    <button
                      onClick={() => performAction("TERMINATE")}
                      disabled={!!actionLoading}
                      className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-lg font-semibold transition-colors text-sm disabled:opacity-60"
                    >
                      <XCircle className="w-4 h-4" />
                      {actionLoading === "TERMINATE" ? "Applying..." : "Terminate"}
                    </button>
                  </div>
                  {actionMessage && (
                    <div className="mt-3 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      {actionMessage}
                    </div>
                  )}
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
                            <div className="text-sm font-medium text-slate-800">{toReadableLabel(v.type)}</div>
                            {v.description && <div className="text-xs text-slate-500">{v.description}</div>}
                          </div>
                          {v.evidence && (
                            <button
                              onClick={() => window.open(v.evidence, "_blank")}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                              title="Open evidence"
                            >
                              Evidence
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                          <div className="text-xs text-slate-400 font-mono">
                            {v.timestamp ? new Date(v.timestamp).toLocaleString() : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Examiner Intervention Log */}
                <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-3">
                    Examiner Actions ({selected.examinerActions?.length || 0})
                  </h3>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
                    {(selected.examinerActions || []).length === 0 ? (
                      <p className="text-slate-400 text-sm">No intervention actions yet</p>
                    ) : (
                      [...selected.examinerActions]
                        .sort(
                          (a: any, b: any) =>
                            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
                        )
                        .map((action: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                          >
                            <div>
                              <div className="text-sm font-medium text-slate-800">
                                {toReadableLabel(action.actionType)}
                              </div>
                              <div className="text-xs text-slate-500">
                                by {action.actorName || "Unknown"}
                              </div>
                              {action.note && (
                                <div className="text-xs text-slate-600 mt-1">{action.note}</div>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">
                              {action.timestamp ? new Date(action.timestamp).toLocaleString() : ""}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
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
                        <div className="text-xs text-slate-500">{toReadableLabel(v.type)}</div>
                        {v.description && (
                          <div className="text-xs text-slate-500">{v.description}</div>
                        )}
                      </div>
                      {v.evidence && (
                        <button
                          onClick={() => window.open(v.evidence, "_blank")}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          title="Open evidence"
                        >
                          Evidence
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
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
