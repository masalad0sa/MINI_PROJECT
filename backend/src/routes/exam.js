import express from "express";
import {
  createExam,
  getExams,
  getExamById,
  updateExam,
  deleteExam,
} from "../controllers/examController.js";
import { protect } from "../middleware/auth.js";
import { requireExaminer } from "../middleware/authorize.js";

const router = express.Router();

// GET routes - accessible to all authenticated users
router.get("/", protect, getExams);
router.get("/:id", protect, getExamById);

// Examiner/Admin routes for exam management
router.post("/", protect, requireExaminer, createExam);
router.put("/:id", protect, requireExaminer, updateExam);
router.delete("/:id", protect, requireExaminer, deleteExam);

export default router;

