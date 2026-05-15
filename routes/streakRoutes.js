import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getStreaks, addCheckin } from '../controllers/streakController.js';

const router = express.Router();

router.get('/streaks', requireAuth, getStreaks);
router.post('/streaks/checkin', requireAuth, addCheckin);

export default router;
