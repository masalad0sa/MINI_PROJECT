import { AlertTriangle, ShieldAlert, XCircle } from "lucide-react";

interface WarningModalProps {
  isOpen: boolean;
  violationType: string;
  violationCount: number;
  onClose: () => void;
}

export function WarningModal({
  isOpen,
  violationType,
  violationCount,
  onClose,
}: WarningModalProps) {
  // Timer removed for testing

  // Reset countdown removed

  // Countdown timer removed for testing purposes
  // useEffect(() => {
  //   if (!isOpen || countdown <= 0) return;
  //   const timer = setInterval(() => { ... }, 1000);
  //   return () => clearInterval(timer);
  // }, [isOpen, countdown]);

  if (!isOpen) return null;

  // Determine warning level based on violation count
  const isFinalWarning = violationCount >= 2;
  const isAutoSubmit = violationCount >= 3;

  const getViolationMessage = (type: string) => {
    switch (type) {
      case "TAB_SWITCH":
        return "You switched to another tab or window";
      case "FULLSCREEN_EXIT":
        return "You exited fullscreen mode";
      case "COPY_PASTE":
        return "Copy/paste is not allowed during the exam";
      case "RIGHT_CLICK":
        return "Right-click is disabled during the exam";
      case "DEV_TOOLS":
        return "Attempting to open developer tools is prohibited";
      case "KEYBOARD_SHORTCUT":
        return "Prohibited keyboard shortcut detected";
      default:
        return "A security violation was detected";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className={`max-w-md w-full mx-4 rounded-2xl shadow-2xl p-8 text-center ${
          isAutoSubmit
            ? "bg-red-600"
            : isFinalWarning
            ? "bg-orange-500"
            : "bg-yellow-500"
        }`}
      >
        {/* Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/20 flex items-center justify-center">
          {isAutoSubmit ? (
            <XCircle className="w-12 h-12 text-white" />
          ) : isFinalWarning ? (
            <ShieldAlert className="w-12 h-12 text-white" />
          ) : (
            <AlertTriangle className="w-12 h-12 text-white" />
          )}
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-2">
          {isAutoSubmit
            ? "🚫 Exam Auto-Submitted"
            : isFinalWarning
            ? "⚠️ FINAL WARNING"
            : "⚠️ Security Warning"}
        </h2>

        {/* Violation message */}
        <p className="text-white/90 mb-4">
          {getViolationMessage(violationType)}
        </p>

        {/* Violation count */}
        <div className="bg-white/20 rounded-lg py-3 px-4 mb-6">
          <p className="text-white font-semibold">
            Violation {violationCount} of 3
          </p>
          {!isAutoSubmit && (
            <p className="text-white/80 text-sm">
              {3 - violationCount} violation(s) remaining before auto-submit
            </p>
          )}
        </div>

        {/* Warning text */}
        {isAutoSubmit ? (
          <p className="text-white/90 mb-6">
            Your exam has been automatically submitted due to multiple security
            violations. Your responses have been saved.
          </p>
        ) : (
          <p className="text-white/90 mb-6">
            {isFinalWarning
              ? "This is your FINAL warning. One more violation will automatically submit your exam."
              : "Please stay focused on your exam. Do not switch tabs or attempt prohibited actions."}
          </p>
        )}

        {/* Button */}
        {!isAutoSubmit && (
          <button
            onClick={onClose}
            className="w-full py-3 rounded-lg font-semibold transition-all bg-white text-slate-800 hover:bg-white/90"
          >
            I Understand - Continue Exam
          </button>
        )}

        {isAutoSubmit && (
          <button
            onClick={onClose}
            className="w-full py-3 bg-white text-red-600 rounded-lg font-semibold hover:bg-white/90 transition-all"
          >
            View Results
          </button>
        )}
      </div>
    </div>
  );
}
