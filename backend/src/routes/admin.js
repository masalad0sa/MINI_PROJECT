import express from "express";
import {
  getAdminDashboard,
  getActiveExamSessions,
  getAllUsers,
  suspendStudent,
  unsuspendStudent,
} from "../controllers/adminController.js";
import { protectAdmin, requireAdminRole } from "../middleware/admin.js";

const router = express.Router();

// All admin routes require both authentication and admin role
router.get("/dashboard", protectAdmin, requireAdminRole, getAdminDashboard);
router.get("/active-exams", protectAdmin, requireAdminRole, getActiveExamSessions);
router.get("/users", protectAdmin, requireAdminRole, getAllUsers);
router.post("/suspend/:studentId", protectAdmin, requireAdminRole, suspendStudent);
router.post("/unsuspend/:studentId", protectAdmin, requireAdminRole, unsuspendStudent);

export default router;
