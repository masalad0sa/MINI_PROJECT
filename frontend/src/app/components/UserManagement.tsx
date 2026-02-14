import { useState, useEffect } from "react";
import {
  Users,
  Search,
  Loader,
  Ban,
  CheckCircle,
  AlertCircle,
  User,
  X,
} from "lucide-react";
import * as api from "../../lib/api";

interface UserData {
  _id: string;
  name: string;
  email: string;
  userId?: string;
  role: string;
  isSuspended?: boolean;
  createdAt?: string;
}

export function UserManagement() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [suspendModal, setSuspendModal] = useState<{ userId: string; name: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadUsers = async (role?: string) => {
    setLoading(true);
    try {
      const filterRole = role === "all" ? undefined : role;
      const res = await api.getAllUsers(filterRole);
      if (res.success) {
        setUsers(res.data || []);
      }
    } catch (err) {
      console.error("Failed to load users", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(activeTab);
  }, [activeTab]);

  const handleSuspend = async () => {
    if (!suspendModal || !suspendReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await api.suspendStudent(suspendModal.userId, suspendReason);
      if (res.success) {
        setUsers(prev =>
          prev.map(u => u._id === suspendModal.userId ? { ...u, isSuspended: true } : u)
        );
        setSuspendModal(null);
        setSuspendReason("");
      }
    } catch (err) {
      console.error("Failed to suspend", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsuspend = async (userId: string) => {
    setActionLoading(true);
    try {
      const res = await api.unsuspendStudent(userId);
      if (res.success) {
        setUsers(prev =>
          prev.map(u => u._id === userId ? { ...u, isSuspended: false } : u)
        );
      }
    } catch (err) {
      console.error("Failed to unsuspend", err);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.userId?.toLowerCase().includes(q)
    );
  });

  const tabs = [
    { key: "all", label: "All Users" },
    { key: "student", label: "Students" },
    { key: "examiner", label: "Examiners" },
    { key: "admin", label: "Admins" },
  ];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin": return "bg-purple-100 text-purple-700";
      case "examiner": return "bg-blue-100 text-blue-700";
      case "moderator": return "bg-indigo-100 text-indigo-700";
      default: return "bg-green-100 text-green-700";
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Users className="w-8 h-8 text-purple-600" />
            User Management
          </h1>
          <p className="text-slate-600 mt-1">View and manage all system users</p>
        </div>

        {/* Tabs + Search */}
        <div className="bg-white rounded-xl shadow-md border border-slate-200 mb-6">
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <div className="flex gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? "bg-purple-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 w-64"
              />
            </div>
          </div>

          {/* User Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader className="w-6 h-6 text-purple-600 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">User</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">User ID</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Email</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user._id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-600" />
                          </div>
                          <span className="font-medium text-slate-800">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">@{user.userId || "—"}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{user.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getRoleBadge(user.role)}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {user.isSuspended ? (
                          <span className="flex items-center gap-1 text-red-600 text-sm">
                            <Ban className="w-4 h-4" /> Suspended
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-600 text-sm">
                            <CheckCircle className="w-4 h-4" /> Active
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {user.role !== "admin" && (
                          user.isSuspended ? (
                            <button
                              onClick={() => handleUnsuspend(user._id)}
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              Unsuspend
                            </button>
                          ) : (
                            <button
                              onClick={() => setSuspendModal({ userId: user._id, name: user.name })}
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                              Suspend
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Count */}
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-sm text-slate-500">
            Showing {filteredUsers.length} of {users.length} users
          </div>
        </div>
      </div>

      {/* Suspend Modal */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                Suspend User
              </h3>
              <button onClick={() => setSuspendModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to suspend <strong>{suspendModal.name}</strong>? They will not be able to access the system.
            </p>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason *</label>
            <textarea
              value={suspendReason}
              onChange={e => setSuspendReason(e.target.value)}
              placeholder="Enter reason for suspension..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
              rows={3}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setSuspendModal(null)}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSuspend}
                disabled={!suspendReason.trim() || actionLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? "Suspending..." : "Confirm Suspend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
