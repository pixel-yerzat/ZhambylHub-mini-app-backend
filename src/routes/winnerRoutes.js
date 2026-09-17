import { Router } from 'express';
import { WinnerController } from '../controllers/winnerController.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { telegramAuthMiddleware } from '../middleware/telegramAuth.js';

const router = Router();

// Publicly view past winners
router.get('/', WinnerController.getAll);
router.get('/:id', WinnerController.getById);

// Add winner to registry - requires admin credentials (secret key or Telegram admin)
router.post(
  '/',
  (req, res, next) => {
    if (req.headers['x-admin-secret-key']) {
      return requireAdmin(req, res, next);
    }
    telegramAuthMiddleware(req, res, () => {
      requireAdmin(req, res, next);
    });
  },
  WinnerController.create
);

export default router;
