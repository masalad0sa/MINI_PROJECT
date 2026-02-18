
import { useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { AlertCircle, Loader, UserPlus, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export function SignUpScreen() {
  const { register, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setLocalError("Password must be at least 6 characters");
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(userId)) {
      setLocalError("Student ID must be 3-20 alphanumeric characters (or underscores)");
      return;
    }

    // Debugging logs
    console.log("Submitting Registration:", { email, password, name, userId, role });
    
    try {
      await register(email, password, name, userId, role);
      navigate("/dashboard"); // Redirect to dashboard after successful registration
    } catch (err) {
        // Error is handled by AuthContext but we can set local error if needed
        // The AuthContext sets the 'error' state which we display below
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl">SP</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">
            SmartProctor
            </h1>
            <p className="text-slate-600">Create your account</p>
        </div>

        {/* Sign Up Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-lg p-8 space-y-4"
        >
          {/* Error Messages */}
          {(error || localError) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 text-sm">
                  Registration Error
                </p>
                <p className="text-red-700 text-sm">{error || localError}</p>
              </div>
            </div>
          )}

          {/* Name Input */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Full Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="John Doe"
              required
              disabled={isLoading}
            />
          </div>

          {/* Role Selection */}
          <div>
            <label
              htmlFor="role"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              I am a
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition bg-white"
              disabled={isLoading}
            >
              <option value="student">Student</option>
              <option value="examiner">Examiner</option>
            </select>
          </div>

          {/* User ID Input */}
          <div>
            <label
              htmlFor="userId"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Student ID / Username
            </label>
            <input
              type="text"
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="S123456"
              required
              disabled={isLoading}
            />
            <p className="text-xs text-slate-500 mt-1">
              Must be 3-20 characters (letters, numbers, underscores)
            </p>
          </div>

          {/* Email Input */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 mb-1"
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
          </div>

          {/* Password Input */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Create a password"
              required
              disabled={isLoading}
            />
          </div>

          {/* Confirm Password Input */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Confirm your password"
              required
              disabled={isLoading}
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 mt-6"
          >
            {isLoading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Sign Up</span>
              </>
            )}
          </button>
          
           {/* Back to Login */}
           <div className="text-center mt-4">
            <Link 
                to="/" 
                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center gap-1"
            >
                <ArrowLeft className="w-3 h-3" />
                Back to Login
            </Link>
          </div>
        </form>

        {/* Footer */}
        <p className="text-center text-slate-600 text-sm mt-6">
          Part of SmartProctor Exam Proctoring System
        </p>
      </div>
    </div>
  );
}
