import express from 'express';
import { verifyPurchase, getPremiumStatus, restorePurchases } from '../controllers/donationsController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET  /donations/status      → check if current user is premium
router.get('/status', requireAuth, getPremiumStatus);

// POST /donations/verify-purchase → verify a store receipt and grant premium
router.post('/verify-purchase', requireAuth, verifyPurchase);

// POST /donations/restore     → restore a previous purchase from DB history
router.post('/restore', requireAuth, restorePurchases);

export default router;
