import { useState, useEffect } from "react";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  User,
  FileText,
  Loader,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Shield,
} from "lucide-react";
import * as api from "../../lib/api";

export function IntegrityReport() {
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  useEffect(() => {
    const loadExams = async () => {
      try {
        const res = await api.getExams();
        if (res.success) {
          setExams(res.data || res.exams || []);
        }
      } catch (err) {
        console.error("Failed to load exams", err);
      } finally {
        setLoading(false);
      }
    };
    loadExams();
  }, []);

  useEffect(() => {
    if (selectedExamId) loadReport();
  }, [selectedExamId]);

  const loadReport = async () => {
    setReportLoading(true);
    try {
      const res = await api.getAdminIntegrityReport(selectedExamId);
      if (res.success) {
        setReportData(res.data);
      }
    } catch (err) {
      console.error("Failed to load report", err);
    } finally {
      setReportLoading(false);
    }
  };

  const getSuspicionLevel = (score: number) => {
    if (score <= 20) return { label: "Low Risk", color: "text-green-600", bg: "bg-green-50", border: "border-green-200", icon: CheckCircle, ringColor: "bg-green-500" };
    if (score <= 50) return { label: "Medium Risk", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: AlertTriangle, ringColor: "bg-amber-500" };
    return { label: "High Risk", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", icon: AlertCircle, ringColor: "bg-red-500" };
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
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-8 mb-8 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-8 h-8" />
                <h1 className="text-2xl font-bold">Integrity Reports</h1>
              </div>
              <p className="text-blue-100">View exam integrity analysis for all submissions</p>
            </div>
            <div>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="bg-white/20 border border-white/30 text-white rounded-lg px-4 py-2.5 [&>option]:text-slate-800 min-w-[200px]"
              >
                <option value="">Select Exam</option>
                {exams.map((exam: any) => (
                  <option key={exam._id} value={exam._id}>{exam.title}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {!selectedExamId ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h3 className="text-xl font-semibold text-slate-600 mb-2">Select an Exam</h3>
            <p className="text-slate-500">Choose an exam to view its integrity report</p>
          </div>
        ) : reportLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : reportData ? (
          <>
            {/* Summary Bar */}
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                {reportData.exam?.title} — Summary
              </h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{reportData.summary?.totalStudents || 0}</div>
                  <div className="text-sm text-blue-800">Students</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{reportData.summary?.avgScore || 0}%</div>
                  <div className="text-sm text-green-800">Avg Score</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{reportData.summary?.flagged || 0}</div>
                  <div className="text-sm text-red-800">Flagged</div>
                </div>
                <div className="text-center p-4 bg-amber-50 rounded-lg">
                  <div className="text-2xl font-bold text-amber-600">{reportData.summary?.totalViolations || 0}</div>
                  <div className="text-sm text-amber-800">Violations</div>
                </div>
              </div>
            </div>

            {/* Student Reports */}
            <div className="space-y-4">
              {(reportData.reports || []).map((report: any) => {
                const suspicion = getSuspicionLevel(report.suspicionScore);
                const isExpanded = expandedStudent === report.submissionId;

                return (
                  <div key={report.submissionId} className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
                    {/* Student Header */}
                    <button
                      onClick={() => setExpandedStudent(isExpanded ? null : report.submissionId)}
                      className="w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${suspicion.ringColor}`}>
                          <User className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-left">
                          <div className="font-semibold text-slate-800">{report.studentName}</div>
                          <div className="text-sm text-slate-500">@{report.studentUserId}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-lg font-bold text-slate-800">{report.score ?? "N/A"}%</div>
                          <div className="text-xs text-slate-500">Score</div>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-medium ${suspicion.bg} ${suspicion.color} ${suspicion.border} border`}>
                          {report.suspicionScore}% — {suspicion.label}
                        </div>
                        <div className="text-sm text-slate-500">
                          {report.violationCount} violations
                        </div>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                      </div>
                    </button>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 p-6">
                        <div className="grid grid-cols-2 gap-6 mb-6">
                          {/* Info */}
                          <div className="space-y-3">
                            <h4 className="font-semibold text-slate-700 text-sm">Submission Info</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="text-slate-500">Status</div>
                              <div className="font-medium text-slate-800 capitalize">{report.status}</div>
                              <div className="text-slate-500">Score</div>
                              <div className="font-medium text-slate-800">{report.correctAnswers}/{report.totalQuestions}</div>
                              <div className="text-slate-500">Auto-submitted</div>
                              <div className="font-medium text-slate-800">{report.autoSubmitted ? "Yes" : "No"}</div>
                              <div className="text-slate-500">Started</div>
                              <div className="font-medium text-slate-800">
                                {report.startedAt ? new Date(report.startedAt).toLocaleString() : "N/A"}
                              </div>
                              <div className="text-slate-500">Submitted</div>
                              <div className="font-medium text-slate-800">
                                {report.submittedAt ? new Date(report.submittedAt).toLocaleString() : "N/A"}
                              </div>
                            </div>
                          </div>

                          {/* Violation Summary */}
                          <div>
                            <h4 className="font-semibold text-slate-700 text-sm mb-3">Violations by Type</h4>
                            <div className="space-y-2">
                              {Object.entries(report.violationsByType || {}).map(([type, count]) => (
                                <div key={type} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                  <span className="text-sm text-slate-700">{type.replace(/_/g, " ")}</span>
                                  <span className="text-sm font-semibold text-slate-800">{count as number}</span>
                                </div>
                              ))}
                              {Object.keys(report.violationsByType || {}).length === 0 && (
                                <p className="text-sm text-slate-400 text-center py-2">No violations</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Violation Timeline */}
                        {report.violations.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-blue-600" />
                              Violation Timeline
                            </h4>
                            <div className="relative">
                              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
                              <div className="space-y-3">
                                {report.violations.map((v: any, idx: number) => (
                                  <div key={idx} className="flex items-start gap-4 relative">
                                    <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-white 
                                      ${v.severity === "CRITICAL" ? "bg-red-500" : v.severity === "MEDIUM" ? "bg-amber-500" : "bg-blue-500"}`}>
                                      <AlertCircle className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-200">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="font-medium text-slate-800 text-sm">{v.type?.replace(/_/g, " ")}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getSeverityColor(v.severity)}`}>
                                          {v.severity}
                                        </span>
                                      </div>
                                      <div className="text-xs text-slate-500">
                                        {v.timestamp ? new Date(v.timestamp).toLocaleString() : ""}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {(reportData.reports || []).length === 0 && (
                <div className="bg-white rounded-xl shadow-md p-8 text-center">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <p className="text-slate-600">No submissions found for this exam</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 bg-slate-50 rounded-xl p-4 text-center text-sm text-slate-500">
              Report generated on {new Date().toLocaleString()} · SmartProctor AI System
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
