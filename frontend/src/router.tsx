import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import { LoginScreen } from "./app/components/LoginScreen";
import { StudentDashboard } from "./app/components/StudentDashboard";
import { PreExamCheck } from "./app/components/PreExamCheck";
import { SystemCheck } from "./app/components/SystemCheck";
import { ExamHistory } from "./app/components/ExamHistory";
import { UpcomingExams } from "./app/components/UpcomingExams";
import { ActiveExam } from "./app/components/ActiveExam";
import { AdminDashboard } from "./app/components/AdminDashboard";
import { AdminMonitor } from "./app/components/AdminMonitor";
import { IntegrityReport } from "./app/components/IntegrityReport";
import { UserManagement } from "./app/components/UserManagement";
import { CreateExam } from "./app/components/CreateExam";
import { MainLayout } from "./app/MainLayout";

// Protected route wrapper - redirects to login if not authenticated
function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

// Admin route wrapper - redirects to dashboard if not admin
function AdminRoute() {
  const { user } = useAuth();

  if (!user || (user.role !== "admin" && user.role !== "moderator")) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

// Examiner route wrapper - allows admin and examiner
function ExaminerRoute() {
  const { user } = useAuth();

  if (!user || (user.role !== "admin" && user.role !== "examiner")) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

// Public route - redirects to dashboard if already logged in
function PublicRoute() {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route element={<PublicRoute />}>
          <Route path="/" element={<LoginScreen />} />
        </Route>

        {/* Protected routes with main layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<StudentDashboard />} />
            <Route path="/upcoming-exams" element={<UpcomingExams />} />
            <Route path="/exam-history" element={<ExamHistory />} />
            <Route path="/pre-exam-check" element={<SystemCheck />} />
            <Route path="/exam/:examId/check" element={<PreExamCheck />} />
            <Route path="/exam/:examId" element={<ActiveExam />} />

            {/* Examiner/Admin routes */}
            <Route element={<ExaminerRoute />}>
              <Route path="/exam/create" element={<CreateExam />} />
            </Route>

            {/* Admin only routes */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/monitor" element={<AdminMonitor />} />
              <Route path="/admin/reports" element={<IntegrityReport />} />
              <Route path="/admin/users" element={<UserManagement />} />
            </Route>
          </Route>
        </Route>

        {/* 404 fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

