import { Router } from 'express';
import { getFavorites, toggleFavorite, syncFavorites } from '../controllers/favoritesController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// All favorite routes require authentication
router.use(requireAuth);

router.get('/', getFavorites);
router.post('/toggle', toggleFavorite);
router.post('/sync', syncFavorites);

export default router;
