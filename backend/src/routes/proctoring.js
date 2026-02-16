
import express from 'express';
import { processFrame, getProctoringHealth } from '../controllers/proctoring.js';
// import { protect } from '../middleware/auth.js'; // Assuming we want auth

const router = express.Router();

router.get('/health', getProctoringHealth);

// Supports:
// POST /api/exam/:id/frame
// POST /api/proctoring/:id/frame
// In production, add 'protect' middleware to ensure student is logged in
router.post('/:id/frame', processFrame);

export default router;
