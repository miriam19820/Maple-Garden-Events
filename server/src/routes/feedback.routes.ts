import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { feedbackController } from '../controllers/feedback.controller';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { feedbackTokenParamSchema, submitFeedbackSchema } from '../validators/feedback.validator';

const router = Router();

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' },
});

router.get('/admin/list', requireAuth, feedbackController.listAdmin);

router.get('/:token', feedbackLimiter, validate(feedbackTokenParamSchema), feedbackController.verifyToken);
router.post('/:token', feedbackLimiter, validate(submitFeedbackSchema), feedbackController.submitFeedback);

export default router;
