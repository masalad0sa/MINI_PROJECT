import express from "express";
import {
  monitorExam,
  getIntegrityReport,
  getSubmissionReport,
  takeSubmissionAction,
} from "../controllers/examinerController.js";
import { protectExaminer, requireExaminerRole } from "../middleware/examiner.js";

const router = express.Router();

router.get("/monitor/:examId", protectExaminer, requireExaminerRole, monitorExam);
router.get("/report/:examId", protectExaminer, requireExaminerRole, getIntegrityReport);
router.get(
  "/submission/:submissionId",
  protectExaminer,
  requireExaminerRole,
  getSubmissionReport,
);
router.post(
  "/submission/:submissionId/action",
  protectExaminer,
  requireExaminerRole,
  takeSubmissionAction,
);

export default router;
