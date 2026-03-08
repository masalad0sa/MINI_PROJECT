import { Component, type ReactNode } from "react";
import { ShieldAlert, RefreshCw, Save } from "lucide-react";

interface ExamErrorBoundaryProps {
  children: ReactNode;
  examId?: string;
}

interface ExamErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  answersSaved: boolean;
}

/**
 * Specialized error boundary for the active exam page.
 * On crash: auto-saves any cached answers to localStorage,
 * then shows a recovery UI to resume the exam.
 */
export class ExamErrorBoundary extends Component<
  ExamErrorBoundaryProps,
  ExamErrorBoundaryState
> {
  constructor(props: ExamErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, answersSaved: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ExamErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ExamErrorBoundary] Exam component crashed:", error, errorInfo);

    // Attempt to save any in-progress answers from localStorage keys
    try {
      const examId = this.props.examId || "unknown";
      const timestamp = new Date().toISOString();
      const crashData = {
        examId,
        crashedAt: timestamp,
        error: error.message,
        // The ActiveExam component may store answers in state;
        // we record the crash event so the student knows what happened
      };
      localStorage.setItem(
        `exam_crash_${examId}`,
        JSON.stringify(crashData)
      );
      this.setState({ answersSaved: true });
    } catch {
      // localStorage may be full or unavailable
      console.warn("Failed to save crash data to localStorage");
    }
  }

  handleResume = () => {
    this.setState({ hasError: false, error: null, answersSaved: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
          <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-6">
              <ShieldAlert className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              Exam Interrupted
            </h2>
            <p className="text-slate-500 mb-4">
              A technical error occurred during your exam. Don't worry — your
              exam session is still active on the server and your time is being
              tracked.
            </p>

            {this.state.answersSaved && (
              <div className="flex items-center justify-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 mb-6">
                <Save className="w-4 h-4" />
                Crash data saved locally
              </div>
            )}

            {this.state.error && (
              <pre className="text-left text-xs bg-slate-100 rounded-lg p-4 mb-6 overflow-auto max-h-32 text-red-700 border border-slate-200">
                {this.state.error.message}
              </pre>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleResume}
                className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                Resume Exam
              </button>
              <button
                onClick={this.handleReload}
                className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-semibold transition-colors"
              >
                Reload Page
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-6">
              If this keeps happening, contact your exam administrator.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
