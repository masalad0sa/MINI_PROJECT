const API_BASE =
  ((import.meta as any).env.VITE_API_BASE as string) ||
  "http://localhost:5000/api";

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Handle API responses with 401 detection
async function handleResponse(res: Response) {
  if (res.status === 401) {
    // Token expired or invalid - clear storage
    clearToken();
    localStorage.removeItem("smartproctor_user");
    // Redirect to login
    window.location.href = "/";
    throw new Error("Session expired. Please login again.");
  }
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function logout() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  try {
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers,
    });
    return res.json();
  } catch {
    // Ignore network errors on logout
    return { success: true };
  }
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

export async function register(
  email: string,
  password: string,
  name: string,
  role = "student",
) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, role }),
  });
  return res.json();
}

export async function getExams() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/exam`, { headers });
  return handleResponse(res);
}

export async function getMyExams() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/exam/my-exams`, { headers });
  return handleResponse(res);
}

export async function getExaminerStats() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/exam/stats`, { headers });
  return handleResponse(res);
}

export async function getExamById(id: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/exam/${id}`, { headers });
  return handleResponse(res);
}

export async function createExam(examData: {
  title: string;
  description?: string;
  duration: number;
  passingScore: number;
  scheduledStart: string;
  scheduledEnd: string;
  questions: Array<{
    questionText: string;
    options: string[];
    correctAnswer: number;
  }>;
}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/exam`, {
    method: "POST",
    headers,
    body: JSON.stringify(examData),
  });
  return handleResponse(res);
}

export async function startExam(examId: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/student/exam/start/${examId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  return handleResponse(res);
}

export async function submitExam(sessionId: string, answers: any[]) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/student/exam/submit`, {
    method: "POST",
    headers,
    body: JSON.stringify({ sessionId, answers }),
  });
  return handleResponse(res);
}

export async function getExamResults(examId: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/student/exam/${examId}/results`, {
    headers,
  });
  return handleResponse(res);
}

export async function logViolation(
  sessionId: string,
  type: string,
  severity: string,
  description?: string,
  evidence?: string
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/student/exam/violation`, {
    method: "POST",
    headers,
    body: JSON.stringify({ sessionId, type, severity, description, evidence }),
  });
  return handleResponse(res);
}

export async function resetPassword(email: string) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return res.json();
}

export async function confirmResetPassword(token: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/confirm-reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  return res.json();
}

// ========== Admin API Functions ==========

export async function getAdminDashboard() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/admin/dashboard`, { headers });
  return handleResponse(res);
}

export async function getStudentDashboard(studentId: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/student/dashboard/${studentId}`, { headers });
  return handleResponse(res);
}

export async function getActiveExamSessions() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/admin/active-exams`, { headers });
  return handleResponse(res);
}

// ========== Examiner API Functions ==========

export async function getExaminerMonitor(examId: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/examiner/monitor/${examId}`, { headers });
  return handleResponse(res);
}

export async function getExaminerIntegrityReport(examId: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/examiner/report/${examId}`, { headers });
  return handleResponse(res);
}

export async function getExaminerSubmissionReport(submissionId: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/examiner/submission/${submissionId}`, { headers });
  return handleResponse(res);
}

export async function takeExaminerSubmissionAction(
  submissionId: string,
  actionType:
    | "WARN"
    | "CHAT"
    | "PAUSE"
    | "TERMINATE"
    | "MARK_FALSE_POSITIVE"
    | "ESCALATE"
    | "RESOLVE",
  note?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/examiner/submission/${submissionId}/action`, {
    method: "POST",
    headers,
    body: JSON.stringify({ actionType, note }),
  });
  return handleResponse(res);
}

// Backward-compatible aliases
export const monitorExam = getExaminerMonitor;
export const getAdminIntegrityReport = getExaminerIntegrityReport;
export const getSubmissionReport = getExaminerSubmissionReport;
export const takeSubmissionAction = takeExaminerSubmissionAction;

export async function getAllUsers(role?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const url = role ? `${API_BASE}/admin/users?role=${role}` : `${API_BASE}/admin/users`;
  const res = await fetch(url, { headers });
  return handleResponse(res);
}

export async function suspendStudent(studentId: string, reason: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/admin/suspend/${studentId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ reason }),
  });
  return handleResponse(res);
}

export async function unsuspendStudent(studentId: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };
  const res = await fetch(`${API_BASE}/admin/unsuspend/${studentId}`, {
    method: "POST",
    headers,
  });
  return handleResponse(res);
}
