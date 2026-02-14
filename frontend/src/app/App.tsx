import { useState, useMemo } from "react";
import { useAuth } from "../lib/AuthContext";
import { LoginScreen } from "./components/LoginScreen";
import { PreExamCheck } from "./components/PreExamCheck";
import { StudentDashboard } from "./components/StudentDashboard";
import { ActiveExam } from "./components/ActiveExam";
import { AdminMonitor } from "./components/AdminMonitor";
import { IntegrityReport } from "./components/IntegrityReport";
import {
  Monitor,
  Users,
  FileCheck,
  LayoutDashboard,
  ClipboardCheck,
  LogOut,
} from "lucide-react";

type Screen = "precheck" | "dashboard" | "exam" | "admin" | "report";

export default function App() {
  const { user, logout } = useAuth();
  const [activeScreen, setActiveScreen] = useState<Screen>("dashboard");
  const [selectedExamId, setSelectedExamId] = useState<string>("");

  // Role-based screen filtering
  const screens = useMemo(() => {
    const studentScreens = [
      { id: "precheck" as Screen, name: "Pre-Exam Check", icon: ClipboardCheck },
      { id: "dashboard" as Screen, name: "Student Dashboard", icon: LayoutDashboard },
      { id: "exam" as Screen, name: "Active Exam", icon: Monitor },
    ];

    const adminScreens = [
      { id: "admin" as Screen, name: "Admin Monitor", icon: Users },
      { id: "report" as Screen, name: "Integrity Report", icon: FileCheck },
    ];

    // Admins see all screens, students see only student screens
    if (user?.role === "admin" || user?.role === "moderator") {
      return [...studentScreens, ...adminScreens];
    }
    return studentScreens;
  }, [user?.role]);

  const handleStartExam = () => {
    setActiveScreen("exam");
  };

  const handleSelectExam = (examId: string) => {
    setSelectedExamId(examId);
    setActiveScreen("precheck");
  };

  const handleLogout = () => {
    logout();
    setActiveScreen("dashboard");
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case "precheck":
        return (
          <PreExamCheck examId={selectedExamId} onExamStart={handleStartExam} />
        );
      case "dashboard":
        return <StudentDashboard onSelectExam={handleSelectExam} />;
      case "exam":
        return <ActiveExam examId={selectedExamId} />;
      case "admin":
        return <AdminMonitor />;
      case "report":
        return <IntegrityReport />;
      default:
        return <StudentDashboard onSelectExam={handleSelectExam} />;
    }
  };

  // Show login screen if user is not authenticated
  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-white border-r border-slate-200 shadow-lg flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">SP</span>
            </div>
            <div>
              <h1 className="font-bold text-slate-800">SmartProctor</h1>
              <p className="text-xs text-slate-500">Wireframe Demo</p>
            </div>
          </div>
          {user && (
            <p className="text-xs text-slate-600 mt-2">
              Logged in as: {user.email}
            </p>
          )}
        </div>
        <nav className="p-4 flex-1">
          <div className="space-y-2">
            {screens.map((screen) => (
              <button
                key={screen.id}
                onClick={() => setActiveScreen(screen.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all
                  ${
                    activeScreen === screen.id
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-600 hover:bg-slate-100"
                  }
                `}
              >
                <screen.icon className="w-5 h-5" />
                <span>{screen.name}</span>
              </button>
            ))}
          </div>
        </nav>
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm text-slate-600 hover:bg-slate-100 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Screen Content */}
      <div className="flex-1 overflow-auto">{renderScreen()}</div>
    </div>
  );
}
