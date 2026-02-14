import { useState, useEffect } from "react";
import { useAuth } from "../../lib/AuthContext";
import {
  FileCheck,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader,
  ChevronDown,
  ChevronUp,
  Download,
  Shield,
  AlertCircle,
} from "lucide-react";

interface ViolationRecord {
  type: string;
  description: string;
  severity: string;
  timestamp: string;
}

interface ExamRecord {
  id: string;
  examTitle: string;
  examDate: string;
  score: number;
  totalQuestions: number;
  passingScore: number;
  passed: boolean;
  duration: number;
  status: string;
  autoSubmitted: boolean;
  isSuspicious: boolean;
  violationCount: number;
  violations: ViolationRecord[];
}

// Mock data for demonstration - replace with API call
const mockExamHistory: ExamRecord[] = [
  {
    id: "1",
    examTitle: "CS101 Midterm Examination",
    examDate: "2025-10-12T10:00:00Z",
    score: 85,
    totalQuestions: 50,
    passingScore: 50,
    passed: true,
    duration: 45,
    status: "graded",
    autoSubmitted: false,
    isSuspicious: false,
    violationCount: 1,
    violations: [
      {
        type: "TAB_SWITCH",
        description: "Switched to another tab",
        severity: "MEDIUM",
        timestamp: "2025-10-12T10:15:32Z",
      },
    ],
  },
  {
    id: "2",
    examTitle: "Python Programming Basics",
    examDate: "2025-10-05T14:00:00Z",
    score: 92,
    totalQuestions: 40,
    passingScore: 60,
    passed: true,
    duration: 38,
    status: "graded",
    autoSubmitted: false,
    isSuspicious: false,
    violationCount: 0,
    violations: [],
  },
  {
    id: "3",
    examTitle: "Data Structures Quiz",
    examDate: "2025-09-28T09:00:00Z",
    score: 45,
    totalQuestions: 30,
    passingScore: 50,
    passed: false,
    duration: 25,
    status: "graded",
    autoSubmitted: true,
    isSuspicious: true,
    violationCount: 3,
    violations: [
      {
        type: "FULLSCREEN_EXIT",
        description: "Exited fullscreen mode",
        severity: "CRITICAL",
        timestamp: "2025-09-28T09:10:15Z",
      },
      {
        type: "TAB_SWITCH",
        description: "Switched to another tab",
        severity: "MEDIUM",
        timestamp: "2025-09-28T09:12:45Z",
      },
      {
        type: "TAB_SWITCH",
        description: "Switched to another tab",
        severity: "CRITICAL",
        timestamp: "2025-09-28T09:15:00Z",
      },
    ],
  },
];

export function ExamHistory() {
  const { user } = useAuth();
  const [examHistory, setExamHistory] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    // Simulate API call - replace with actual API
    setTimeout(() => {
      setExamHistory(mockExamHistory);
      setLoading(false);
    }, 500);
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case "CRITICAL":
        return "bg-red-100 text-red-700 border-red-200";
      case "MEDIUM":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "MINOR":
        return "bg-blue-100 text-blue-700 border-blue-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getIntegrityBadge = (record: ExamRecord) => {
    if (record.isSuspicious) {
      return (
        <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
          <AlertTriangle className="w-3 h-3" />
          Flagged
        </span>
      );
    }
    if (record.violationCount > 0) {
      return (
        <span className="flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
          <AlertCircle className="w-3 h-3" />
          {record.violationCount} Warning{record.violationCount > 1 ? "s" : ""}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
        <CheckCircle className="w-3 h-3" />
        Clean
      </span>
    );
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2 flex items-center gap-3">
            <FileCheck className="w-8 h-8 text-blue-600" />
            Exam History & Integrity Reports
          </h1>
          <p className="text-slate-600">
            View your past exam records and proctoring integrity reports
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {examHistory.length}
            </div>
            <div className="text-sm text-slate-600">Total Exams</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {examHistory.filter((e) => e.passed).length}
            </div>
            <div className="text-sm text-slate-600">Passed</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
            <div className="text-3xl font-bold text-slate-700 mb-1">
              {Math.round(
                examHistory.reduce((acc, e) => acc + e.score, 0) /
                  examHistory.length
              )}
              %
            </div>
            <div className="text-sm text-slate-600">Average Score</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border border-slate-200">
            <div className="text-3xl font-bold text-amber-600 mb-1">
              {examHistory.filter((e) => e.violationCount === 0).length}
            </div>
            <div className="text-sm text-slate-600">Clean Sessions</div>
          </div>
        </div>

        {/* Exam Records */}
        <div className="space-y-4">
          {examHistory.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <FileCheck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-600 mb-2">
                No Exam Records
              </h3>
              <p className="text-slate-500">
                Your completed exams will appear here
              </p>
            </div>
          ) : (
            examHistory.map((record) => (
              <div
                key={record.id}
                className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden"
              >
                {/* Header Row */}
                <div
                  className="p-6 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() =>
                    setExpandedId(expandedId === record.id ? null : record.id)
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-slate-800">
                          {record.examTitle}
                        </h3>
                        {record.autoSubmitted && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                            Auto-Submitted
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(record.examDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {record.duration} min
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Score */}
                      <div className="text-right">
                        <div
                          className={`text-2xl font-bold ${
                            record.passed ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {record.score}%
                        </div>
                        <div className="text-xs text-slate-500">
                          {record.passed ? "Passed" : "Failed"}
                        </div>
                      </div>

                      {/* Integrity Badge */}
                      {getIntegrityBadge(record)}

                      {/* Expand Icon */}
                      {expandedId === record.id ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === record.id && (
                  <div className="border-t border-slate-200 bg-slate-50 p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Score Details */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          Exam Results
                        </h4>
                        <div className="bg-white rounded-lg p-4 space-y-3 border border-slate-200">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Score</span>
                            <span className="font-semibold">{record.score}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Questions</span>
                            <span className="font-semibold">
                              {record.totalQuestions}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Passing Score</span>
                            <span className="font-semibold">
                              {record.passingScore}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Duration</span>
                            <span className="font-semibold">
                              {record.duration} minutes
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Status</span>
                            <span
                              className={`font-semibold ${
                                record.passed ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {record.passed ? "PASSED" : "FAILED"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Integrity Report */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                          <Shield className="w-4 h-4 text-blue-600" />
                          Integrity Report
                        </h4>
                        <div className="bg-white rounded-lg p-4 border border-slate-200">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-slate-600">
                              Integrity Status
                            </span>
                            {record.isSuspicious ? (
                              <span className="flex items-center gap-1 text-red-600 font-semibold">
                                <XCircle className="w-4 h-4" />
                                Flagged as Suspicious
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-green-600 font-semibold">
                                <CheckCircle className="w-4 h-4" />
                                Clean
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between mb-4">
                            <span className="text-slate-600">Violations</span>
                            <span
                              className={`font-semibold ${
                                record.violationCount > 0
                                  ? "text-amber-600"
                                  : "text-green-600"
                              }`}
                            >
                              {record.violationCount}
                            </span>
                          </div>

                          {/* Violation Timeline */}
                          {record.violations.length > 0 && (
                            <div className="border-t border-slate-200 pt-4 mt-4">
                              <h5 className="text-xs font-semibold text-slate-500 uppercase mb-3">
                                Violation Timeline
                              </h5>
                              <div className="space-y-2">
                                {record.violations.map((v, idx) => (
                                  <div
                                    key={idx}
                                    className={`flex items-center justify-between p-2 rounded-lg border ${getSeverityColor(
                                      v.severity
                                    )}`}
                                  >
                                    <div className="flex-1">
                                      <div className="font-medium text-sm">
                                        {v.type.replace(/_/g, " ")}
                                      </div>
                                      <div className="text-xs opacity-80">
                                        {v.description}
                                      </div>
                                    </div>
                                    <div className="text-xs font-mono">
                                      {formatTime(v.timestamp)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-6 flex justify-end">
                      <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                        <Download className="w-4 h-4" />
                        Download Report
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
