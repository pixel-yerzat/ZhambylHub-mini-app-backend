import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { telegramAuthMiddleware } from '../middleware/telegramAuth.js';

const router = Router();

// Admin routes with Telegram auth
router.use(telegramAuthMiddleware);

router.get('/applications', AdminController.listApplications);
router.patch('/applications/:id/status', AdminController.updateStatus);

export default router;
