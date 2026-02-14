import express from "express";
import {
  getStudentDashboard,
  submitExam,
  getExamResults,
  startExam,
  logViolation,
} from "../controllers/studentController.js";
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get("/dashboard/:id", protect, getStudentDashboard);
router.post("/exam/start/:examId", protect, startExam);
router.post("/exam/submit", protect, submitExam);
router.post("/exam/violation", protect, logViolation);
router.get("/exam/:examId/results", protect, getExamResults);

export default router;

