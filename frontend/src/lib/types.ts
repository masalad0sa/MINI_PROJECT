// TypeScript interfaces for Enhance-Exam-Proctoring

export interface User {
  id: string;
  email: string;
  name: string;
  role: "student" | "admin" | "moderator";
}

export interface Question {
  _id?: string;
  questionText: string;
  options: string[];
  correctAnswer: number;
  points?: number;
}

export interface Exam {
  _id: string;
  title: string;
  description?: string;
  duration: number;
  totalQuestions: number;
  passingScore: number;
  questions?: Question[];
  createdBy: string;
  status: "active" | "inactive" | "archived";
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Answer {
  questionIndex: number;
  selectedAnswer: number | undefined;
  isCorrect?: boolean;
}

export interface Violation {
  type: string;
  description: string;
  timestamp: string;
}

export interface Submission {
  _id: string;
  studentId: string;
  examId: string | Exam;
  answers: Answer[];
  score?: number;
  totalQuestions: number;
  correctAnswers?: number;
  status: "started" | "submitted" | "graded";
  violations: Violation[];
  startedAt: string;
  submittedAt?: string;
  duration?: number;
}

export interface ExamResult {
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  wrongCount?: number;
  passed: boolean;
  status: string;
  passingScore?: number;
}

export interface ExamSession {
  sessionId: string;
  exam: {
    id: string;
    title: string;
    duration: number;
    totalQuestions: number;
    questions: Question[];
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  token?: string;
  user?: User;
}

export interface DashboardStats {
  completed: number;
  averageScore: number;
}

export interface StudentDashboardData {
  studentId: string;
  upcomingExams: Exam[];
  completedExams: Submission[];
  stats: DashboardStats;
}

export interface AdminDashboardData {
  totalExams: number;
  totalStudents: number;
  ongoingExams: number;
  violations: number;
  stats: Record<string, any>;
}
