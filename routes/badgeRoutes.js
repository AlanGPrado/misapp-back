import express from 'express';
import { getBadges, unlockBadge } from '../controllers/badgeController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requireAuth, getBadges);
router.post('/unlock', requireAuth, unlockBadge);

export default router;
