import { Router } from 'express';
import { WinnerController } from '../controllers/winnerController.js';

const router = Router();

// Publicly view past winners
router.get('/', WinnerController.getAll);
router.get('/:id', WinnerController.getById);

// Add winner to registry
router.post('/', WinnerController.create);

export default router;
