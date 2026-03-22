import { useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { Link } from "react-router-dom";
import { AlertCircle, Loader, LogIn, Shield } from "lucide-react";

export function AdminLoginScreen() {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("password123");
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    try {
      await login(email, password, "admin");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Shield className="w-8 h-8 text-slate-800" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Portal</h1>
          <p className="text-slate-300">SmartProctor Administrative Login</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-lg p-8 space-y-6"
        >
          {(error || localError) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 text-sm">
                  Admin Login Error
                </p>
                <p className="text-red-700 text-sm">{error || localError}</p>
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="admin-email"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Admin Email
            </label>
            <input
              type="email"
              id="admin-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-600 focus:border-transparent outline-none transition"
              placeholder="admin@example.com"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Password
            </label>
            <input
              type="password"
              id="admin-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-600 focus:border-transparent outline-none transition"
              placeholder="********"
              required
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-500 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>Logging in...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Admin Sign In</span>
              </>
            )}
          </button>

          <div className="text-center">
            <p className="text-sm text-slate-600">
              Student or Examiner?{" "}
              <Link to="/" className="text-blue-600 hover:text-blue-800 font-medium">
                Go to Main Login
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
