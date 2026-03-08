
import express from 'express';
import { processFrame, getProctoringHealth, systemCheckFrame } from '../controllers/proctoring.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/health', getProctoringHealth);

// Lightweight face-only check for pre-exam system check (no auth needed).
router.post('/system-check/frame', systemCheckFrame);

// POST /api/proctoring/:id/frame
// Requires authentication — student must be logged in.
router.post('/:id/frame', protect, processFrame);

export default router;
