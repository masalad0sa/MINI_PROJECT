import express from "express";
import {
  register,
  login,
  getMe,
  logout,
  resetPassword,
  confirmResetPassword,
  refreshAccessToken,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { generateCsrfToken } from "../middleware/csrf.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.post("/logout", protect, logout);
router.post("/reset-password", resetPassword);
router.post("/confirm-reset-password", confirmResetPassword);

// Refresh token endpoint — no protect middleware (uses refresh token, not access token)
router.post("/refresh", refreshAccessToken);

// CSRF token endpoint — returns a fresh CSRF token in cookie + body
router.get("/csrf-token", generateCsrfToken);

export default router;
