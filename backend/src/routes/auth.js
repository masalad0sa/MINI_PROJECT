import express from "express";
import {
  register,
  login,
  logout,
  getMe,
  resetPassword,
  confirmResetPassword,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.post("/logout", protect, logout); // Requires authentication
router.post("/reset-password", resetPassword);
router.post("/confirm-reset-password", confirmResetPassword);

export default router;

