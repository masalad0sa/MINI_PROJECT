import express from "express";
import {
  getAdminDashboard,
  getActiveExamSessions,
  monitorExam,
  getIntegrityReport,
  getSubmissionReport,
  getAllUsers,
  suspendStudent,
  unsuspendStudent,
} from "../controllers/adminController.js";
import { protect } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/authorize.js";

const router = express.Router();

// All admin routes require both authentication and admin role
router.get("/dashboard", protect, requireAdmin, getAdminDashboard);
router.get("/active-exams", protect, requireAdmin, getActiveExamSessions);
router.get("/monitor/:examId", protect, requireAdmin, monitorExam);
router.get("/report/:examId", protect, requireAdmin, getIntegrityReport);
router.get("/submission/:submissionId", protect, requireAdmin, getSubmissionReport);
router.get("/users", protect, requireAdmin, getAllUsers);
router.post("/suspend/:studentId", protect, requireAdmin, suspendStudent);
router.post("/unsuspend/:studentId", protect, requireAdmin, unsuspendStudent);

export default router;
