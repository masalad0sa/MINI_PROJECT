import { useState, useRef, useEffect, useMemo } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import {
  Users,
  FileCheck,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  ChevronDown,
  User,
  ClipboardCheck,
  History,
  CalendarDays,
  Monitor,
  Shield,
} from "lucide-react";

interface NavItem {
  path: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Role-based navigation items
  const navItems = useMemo(() => {
    const studentItems: NavItem[] = [
      { path: "/dashboard", name: "Dashboard", icon: LayoutDashboard },
      { path: "/available-exams", name: "Available Exams", icon: CalendarDays },
      { path: "/exam-history", name: "Exam History", icon: History },
      { path: "/pre-exam-check", name: "System Check", icon: ClipboardCheck },
    ];

    const examinerItems: NavItem[] = [
      { path: "/exam/create", name: "Create Exam", icon: PlusCircle },
    ];

    const adminItems: NavItem[] = [
      { path: "/admin", name: "Admin Dashboard", icon: Shield },
      { path: "/admin/monitor", name: "Live Monitor", icon: Monitor },
      { path: "/admin/reports", name: "Integrity Reports", icon: FileCheck },
      { path: "/admin/users", name: "User Management", icon: Users },
    ];

    // Admins see all screens
    if (user?.role === "admin" || user?.role === "moderator") {
      return [...studentItems, ...examinerItems, ...adminItems];
    }
    // Examiners see dashboard + create exam
    if (user?.role === "examiner") {
      return [...studentItems, ...examinerItems];
    }
    // Students see dashboard + system check
    return studentItems;
  }, [user?.role]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

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
              <p className="text-xs text-slate-500">Exam Proctoring System</p>
            </div>
          </div>
        </div>

        <nav className="p-4 flex-1">
          <div className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }: { isActive: boolean }) =>
                  `w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
          <div className="text-lg font-semibold text-slate-700">
            Welcome back, {user?.name?.split(" ")[0] || "User"}
          </div>
          
          {/* User Profile Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-slate-700">
                  @{user?.userId || "user"}
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showProfileMenu ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown Menu */}
            {showProfileMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50">
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{user?.name || "User"}</p>
                      <p className="text-sm text-blue-600">@{user?.userId || "user"}</p>
                      <p className="text-xs text-slate-500 capitalize">{user?.role || "student"}</p>
                    </div>
                  </div>
                </div>
                <div className="p-2">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

