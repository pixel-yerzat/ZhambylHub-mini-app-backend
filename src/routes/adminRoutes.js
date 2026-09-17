import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { telegramAuthMiddleware } from '../middleware/telegramAuth.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = Router();

// Allow either Telegram auth OR Admin Secret Key, then enforce requireAdmin
router.use((req, res, next) => {
  if (req.headers['x-admin-secret-key']) {
    return requireAdmin(req, res, next);
  }
  telegramAuthMiddleware(req, res, () => {
    requireAdmin(req, res, next);
  });
});

router.get('/applications', AdminController.listApplications);
router.patch('/applications/:id/status', AdminController.updateStatus);

export default router;
