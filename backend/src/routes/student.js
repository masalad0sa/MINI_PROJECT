import express from "express";
import {
  getStudentDashboard,
  submitExam,
  getExamResults,
  getExamSessionStatus,
  postExamHeartbeat,
  startExam,
  logViolation,
} from "../controllers/studentController.js";
import { protectStudent, requireStudentRole } from "../middleware/student.js";

const router = express.Router();

router.get("/dashboard/:id", protectStudent, requireStudentRole, getStudentDashboard);
router.post("/exam/start/:examId", protectStudent, requireStudentRole, startExam);
router.post("/exam/submit", protectStudent, requireStudentRole, submitExam);
router.post("/exam/violation", protectStudent, requireStudentRole, logViolation);
router.post(
  "/exam/session/:sessionId/heartbeat",
  protectStudent,
  requireStudentRole,
  postExamHeartbeat,
);
router.get("/exam/:examId/results", protectStudent, requireStudentRole, getExamResults);
router.get("/exam/session/:sessionId/status", protectStudent, requireStudentRole, getExamSessionStatus);

export default router;

