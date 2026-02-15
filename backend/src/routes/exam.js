import express from "express";
import {
  createExam,
  getExams,
  getExamsByCreator,
  getExaminerStats,
  getExamById,
  updateExam,
  deleteExam,
} from "../controllers/examController.js";
import { protect } from "../middleware/auth.js";
import { requireExaminerRole } from "../middleware/examiner.js";

const router = express.Router();

// GET routes - accessible to all authenticated users
router.get("/my-exams", protect, requireExaminerRole, getExamsByCreator);
router.get("/stats", protect, requireExaminerRole, getExaminerStats);
router.get("/", protect, getExams);
router.get("/:id", protect, getExamById);

// Examiner/Admin routes for exam management
router.post("/", protect, requireExaminerRole, createExam);
router.put("/:id", protect, requireExaminerRole, updateExam);
router.delete("/:id", protect, requireExaminerRole, deleteExam);

export default router;

