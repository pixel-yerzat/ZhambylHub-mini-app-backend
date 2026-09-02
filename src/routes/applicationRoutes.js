import { Router } from 'express';
import { ApplicationController } from '../controllers/applicationController.js';
import { telegramAuthMiddleware } from '../middleware/telegramAuth.js';
import { submissionLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All application routes require Telegram Authentication
router.use(telegramAuthMiddleware);

// Submit new project application
router.post('/submit', submissionLimiter, ApplicationController.submit);

// Get my projects
router.get('/my', ApplicationController.getMyApplications);

// Get single project
router.get('/:id', ApplicationController.getById);

export default router;
