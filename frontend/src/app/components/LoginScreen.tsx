import { useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { Link } from "react-router-dom";
import { AlertCircle, Loader, LogIn } from "lucide-react";

type LoginRole = "student" | "examiner";

const DEMO_EMAILS: Record<LoginRole, string> = {
  student: "student@example.com",
  examiner: "examiner@example.com",
};

export function LoginScreen() {
  const { login, isLoading, error } = useAuth();
  const [selectedRole, setSelectedRole] = useState<LoginRole>("student");
  const [email, setEmail] = useState(DEMO_EMAILS.student);
  const [password, setPassword] = useState("password123");
  const [rememberMe, setRememberMe] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    try {
      await login(email, password, selectedRole, rememberMe);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed");
    }
  };

  const handleRoleChange = (role: LoginRole) => {
    setSelectedRole(role);
    setLocalError("");
    setEmail(DEMO_EMAILS[role]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl">SP</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            SmartProctor
          </h1>
          <p className="text-slate-600">Student and Examiner Login</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-lg p-8 space-y-6"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Login As
            </label>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => handleRoleChange("student")}
                disabled={isLoading}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  selectedRole === "student"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                Student
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange("examiner")}
                disabled={isLoading}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  selectedRole === "examiner"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                Examiner
              </button>
            </div>
          </div>

          {(error || localError) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 text-sm">
                  Login Error
                </p>
                <p className="text-red-700 text-sm">{error || localError}</p>
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="you@example.com"
              required
              disabled={isLoading}
            />
            <p className="text-xs text-slate-500 mt-1">
              Demo: {DEMO_EMAILS[selectedRole]}
            </p>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="********"
              required
              disabled={isLoading}
            />
            <p className="text-xs text-slate-500 mt-1">Demo: password123</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isLoading}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Remember me for 1 week</span>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>Logging in...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </>
            )}
          </button>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-medium mb-2">
              Demo Credentials:
            </p>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>
                Student: <span className="font-mono">student@example.com</span>
              </li>
              <li>
                Examiner:{" "}
                <span className="font-mono">examiner@example.com</span>
              </li>
              <li>
                Password: <span className="font-mono">password123</span>
              </li>
            </ul>
          </div>

          <div className="text-center mt-4">
            <p className="text-sm text-slate-600">
              Don&apos;t have an account?{" "}
              <Link
                to="/signup"
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                Sign up
              </Link>
            </p>
            <p className="text-sm text-slate-600 mt-2">
              Admin?{" "}
              <Link
                to="/admin-login"
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                Use Admin Login
              </Link>
            </p>
          </div>
        </form>

        <p className="text-center text-slate-600 text-sm mt-6">
          Part of SmartProctor Exam Proctoring System
        </p>
      </div>
    </div>
  );
}
