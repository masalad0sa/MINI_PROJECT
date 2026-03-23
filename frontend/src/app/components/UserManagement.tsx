import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Search,
  Loader,
  Ban,
  CheckCircle,
  AlertCircle,
  User,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
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

type StatusFilter = "all" | "active" | "suspended";
type FeedbackState = {
  type: "success" | "error";
  message: string;
} | null;

const PAGE_SIZE = 10;

export function UserManagement() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [suspendModal, setSuspendModal] = useState<{ userId: string; name: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ userId: string; name: string; role: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadUsers = useCallback(
    async ({
      page = currentPage,
      showLoader = false,
    }: { page?: number; showLoader?: boolean } = {}) => {
      if (showLoader) setLoading(true);
      try {
        const filterRole = activeTab === "all" ? undefined : activeTab;
        const filterStatus = statusFilter === "all" ? undefined : statusFilter;
        const res = await api.getAllUsers({
          role: filterRole,
          status: filterStatus,
          search: searchQuery || undefined,
          page,
          limit: PAGE_SIZE,
        });

        if (res.success) {
          const resultUsers = res.data || [];
          const resultPagination = res.pagination || {};
          const resolvedPage = resultPagination.page || page;
          setUsers(resultUsers);
          setPagination({
            page: resolvedPage,
            limit: resultPagination.limit || PAGE_SIZE,
            total: resultPagination.total ?? resultUsers.length,
            totalPages: resultPagination.totalPages || 1,
          });
          if (resolvedPage !== currentPage) {
            setCurrentPage(resolvedPage);
          }
        } else {
          setUsers([]);
          setPagination({
            page: 1,
            limit: PAGE_SIZE,
            total: 0,
            totalPages: 1,
          });
        }
      } catch (err) {
        console.error("Failed to load users", err);
        setFeedback({
          type: "error",
          message: "Failed to load users. Please try again.",
        });
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [activeTab, statusFilter, searchQuery, currentPage],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedUserIds(new Set());
  }, [activeTab, statusFilter, searchQuery]);

  useEffect(() => {
    setSelectedUserIds(new Set());
  }, [currentPage]);

  useEffect(() => {
    loadUsers({ page: currentPage, showLoader: true });
    const interval = setInterval(
      () => loadUsers({ page: currentPage, showLoader: false }),
      20000,
    );
    return () => clearInterval(interval);
  }, [currentPage, loadUsers]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const selectableUsers = useMemo(
    () => users.filter((u) => u.role !== "admin"),
    [users],
  );
  const allSelectableSelected =
    selectableUsers.length > 0 &&
    selectableUsers.every((u) => selectedUserIds.has(u._id));
  const selectedCount = selectedUserIds.size;

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedUserIds(new Set());
      return;
    }
    setSelectedUserIds(new Set(selectableUsers.map((u) => u._id)));
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const clearSuspendModal = () => {
    setSuspendModal(null);
    setSuspendReason("");
  };

  const handleSuspend = async () => {
    if (!suspendModal || !suspendReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await api.suspendStudent(suspendModal.userId, suspendReason.trim());
      if (res.success) {
        setFeedback({ type: "success", message: "User suspended successfully." });
        clearSuspendModal();
        await loadUsers({ page: currentPage, showLoader: false });
      } else {
        setFeedback({ type: "error", message: "Failed to suspend user." });
      }
    } catch (err) {
      console.error("Failed to suspend", err);
      setFeedback({ type: "error", message: "Failed to suspend user." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsuspend = async (userId: string) => {
    setActionLoading(true);
    try {
      const res = await api.unsuspendStudent(userId);
      if (res.success) {
        setFeedback({ type: "success", message: "User unsuspended successfully." });
        await loadUsers({ page: currentPage, showLoader: false });
      } else {
        setFeedback({ type: "error", message: "Failed to unsuspend user." });
      }
    } catch (err) {
      console.error("Failed to unsuspend", err);
      setFeedback({ type: "error", message: "Failed to unsuspend user." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteModal) return;
    setActionLoading(true);
    try {
      const res = await api.deleteUser(deleteModal.userId);
      if (res.success) {
        setFeedback({ type: "success", message: "User deleted successfully." });
        setDeleteModal(null);
        setSelectedUserIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteModal.userId);
          return next;
        });
        await loadUsers({ page: currentPage, showLoader: false });
      } else {
        setFeedback({ type: "error", message: "Failed to delete user." });
      }
    } catch (err) {
      console.error("Failed to delete user", err);
      setFeedback({ type: "error", message: "Failed to delete user." });
    } finally {
      setActionLoading(false);
    }
  };

  const runBulkAction = async (
    action: "suspend" | "unsuspend" | "delete" | "promote",
  ) => {
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) return;

    let reason = "";
    if (action === "suspend") {
      reason = (window.prompt("Enter suspension reason for selected users:") || "").trim();
      if (!reason) return;
    }

    if (action === "delete") {
      const confirmed = window.confirm(
        `Delete ${ids.length} user(s)? This cannot be undone.`,
      );
      if (!confirmed) return;
    }

    if (action === "promote") {
      const confirmed = window.confirm(
        `Promote ${ids.length} user(s) to admin role?`,
      );
      if (!confirmed) return;
    }

    setActionLoading(true);
    let successCount = 0;
    let failureCount = 0;

    for (const id of ids) {
      try {
        if (action === "suspend") {
          await api.suspendStudent(id, reason);
        } else if (action === "unsuspend") {
          await api.unsuspendStudent(id);
        } else if (action === "promote") {
          await api.changeUserRole(id, "admin");
        } else {
          await api.deleteUser(id);
        }
        successCount += 1;
      } catch (err) {
        console.error(`Bulk ${action} failed for user ${id}`, err);
        failureCount += 1;
      }
    }

    setActionLoading(false);
    setSelectedUserIds(new Set());
    await loadUsers({ page: currentPage, showLoader: false });
    const actionPastTense =
      action === "delete"
        ? "deleted"
        : action === "promote"
          ? "promoted"
          : `${action}ed`;

    if (failureCount === 0) {
      setFeedback({
        type: "success",
        message: `${successCount} user(s) ${actionPastTense} successfully.`,
      });
    } else {
      setFeedback({
        type: "error",
        message: `${successCount} succeeded, ${failureCount} failed during bulk ${action}.`,
      });
    }
  };

  const tabs = [
    { key: "all", label: "All Users" },
    { key: "student", label: "Students" },
    { key: "examiner", label: "Examiners" },
    { key: "admin", label: "Admins" },
  ];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-purple-100 text-purple-700";
      case "examiner":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-green-100 text-green-700";
    }
  };

  const showingFrom =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) * pagination.limit + 1;
  const showingTo = Math.min(
    pagination.total,
    pagination.page * pagination.limit,
  );

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Users className="w-8 h-8 text-purple-600" />
            User Management
          </h1>
          <p className="text-slate-600 mt-1">View and manage all system users</p>
        </div>

        {feedback && (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {feedback.message}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md border border-slate-200 mb-6">
          <div className="p-4 border-b border-slate-200 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex gap-1">
                {tabs.map((tab) => (
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
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as StatusFilter)
                  }
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 w-64"
                  />
                </div>
              </div>
            </div>

            {selectedCount > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                <span className="text-sm text-purple-700 font-medium">
                  {selectedCount} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runBulkAction("suspend")}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
                  >
                    Bulk Suspend
                  </button>
                  <button
                    onClick={() => runBulkAction("unsuspend")}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    Bulk Unsuspend
                  </button>
                  <button
                    onClick={() => runBulkAction("delete")}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Bulk Delete
                  </button>
                  <button
                    onClick={() => runBulkAction("promote")}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    Bulk Make Admin
                  </button>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader className="w-6 h-6 text-purple-600 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 w-12">
                      <input
                        type="checkbox"
                        checked={allSelectableSelected}
                        onChange={toggleSelectAll}
                        disabled={selectableUsers.length === 0}
                        className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">User</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">User ID</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Email</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4">
                        {user.role !== "admin" ? (
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(user._id)}
                            onChange={() => toggleUserSelection(user._id)}
                            className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                          />
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-600" />
                          </div>
                          <span className="font-medium text-slate-800">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">@{user.userId || "-"}</td>
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
                          <div className="inline-flex items-center gap-2">
                            {user.isSuspended ? (
                              <button
                                onClick={() => handleUnsuspend(user._id)}
                                disabled={actionLoading}
                                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                              >
                                Unsuspend
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  setSuspendModal({ userId: user._id, name: user.name })
                                }
                                disabled={actionLoading}
                                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                              >
                                Suspend
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                const confirmed = window.confirm(
                                  `Make ${user.name} an admin?`,
                                );
                                if (!confirmed) return;
                                setActionLoading(true);
                                try {
                                  const res = await api.changeUserRole(user._id, "admin");
                                  if (res.success) {
                                    setFeedback({
                                      type: "success",
                                      message: `${user.name} is now an admin.`,
                                    });
                                    setSelectedUserIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(user._id);
                                      return next;
                                    });
                                    await loadUsers({ page: currentPage, showLoader: false });
                                  } else {
                                    setFeedback({
                                      type: "error",
                                      message: `Failed to update role for ${user.name}.`,
                                    });
                                  }
                                } catch (err) {
                                  console.error("Failed to change user role", err);
                                  setFeedback({
                                    type: "error",
                                    message: `Failed to update role for ${user.name}.`,
                                  });
                                } finally {
                                  setActionLoading(false);
                                }
                              }}
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
                            >
                              Make Admin
                            </button>
                            <button
                              onClick={() =>
                                setDeleteModal({
                                  userId: user._id,
                                  name: user.name,
                                  role: user.role,
                                })
                              }
                              disabled={actionLoading}
                              className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-black transition-colors disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <span className="text-sm text-slate-500">
              Showing {showingFrom}-{showingTo} of {pagination.total} users
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.max(1, prev - 1))
                }
                disabled={pagination.page <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <span className="text-sm text-slate-600">
                Page {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((prev) =>
                    Math.min(pagination.totalPages, prev + 1),
                  )
                }
                disabled={pagination.page >= pagination.totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {suspendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                Suspend User
              </h3>
              <button
                onClick={clearSuspendModal}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to suspend <strong>{suspendModal.name}</strong>? They will not be able to access the system.
            </p>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason *</label>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Enter reason for suspension..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
              rows={3}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={clearSuspendModal}
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

      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                Delete User
              </h3>
              <button
                onClick={() => setDeleteModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to permanently delete <strong>{deleteModal.name}</strong> ({deleteModal.role})? This action cannot be undone.
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
