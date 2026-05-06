// routes/authRoutes.js

import { Router } from 'express';
import { register, login, refreshToken, logout, getMe } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// Public routes
router.post('/auth/register', register);
router.post('/auth/login',    login);
router.post('/auth/refresh',  refreshToken);
router.post('/auth/logout',   logout);

// Protected route
router.get('/auth/me', requireAuth, getMe);

export default router;
