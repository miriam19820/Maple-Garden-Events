import { Router } from 'express';
import { feedbackController } from '../controllers/feedback.controller';

const router = Router();

// GET: מתבצע אוטומטית כשהלקוח פותח את הקישור
router.get('/:token', feedbackController.verifyToken);

// POST: מתבצע כשהלקוח לוחץ על כפתור "שלח" בטופס
router.post('/:token', feedbackController.submitFeedback);

export default router;