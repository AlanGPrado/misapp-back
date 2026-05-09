// routes/authRoutes.js

import { Router } from 'express';
import { register, login, refreshToken, logout, getMe, updateProfile } from '../controllers/authController.js';
import { forgotPassword, resetPassword } from '../controllers/passwordResetController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// Public routes
router.post('/auth/register', register);
router.post('/auth/login',    login);
router.post('/auth/refresh',  refreshToken);
router.post('/auth/logout',   logout);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password',   resetPassword);

// Protected routes
router.get('/auth/me', requireAuth, getMe);
router.put('/auth/update-profile', requireAuth, updateProfile);

export default router;
