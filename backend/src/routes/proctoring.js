import express from "express";
import rateLimit from "express-rate-limit";
import {
  processFrame,
  getProctoringHealth,
  systemCheckFrame,
  calibrateGaze,
} from "../controllers/proctoring.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();
const proctoringFrameLimitPerMinute =
  Number.parseInt(process.env.PROCTORING_FRAME_LIMIT_PER_MIN || "1200", 10) ||
  1200;
const proctoringFrameLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: Math.max(60, proctoringFrameLimitPerMinute),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many proctoring frames. Reduce frame upload rate.",
  },
  // Key by authenticated user + exam route for fair isolation.
  keyGenerator: (req) => {
    const userId = req.user?._id?.toString?.() || req.ip;
    const examId = req.params?.id || "unknown";
    return `${userId}:${examId}`;
  },
  skip: (req) => process.env.NODE_ENV === "test" || req.method === "OPTIONS",
});

router.get("/health", getProctoringHealth);

// Lightweight face-only check for pre-exam system check (no auth needed).
router.post("/system-check/frame", systemCheckFrame);

// Gaze/head calibration — requires auth (student must be logged in).
router.post("/calibrate", protect, calibrateGaze);

// POST /api/proctoring/:id/frame
// Requires authentication — student must be logged in.
router.post("/:id/frame", protect, proctoringFrameLimiter, processFrame);

export default router;
