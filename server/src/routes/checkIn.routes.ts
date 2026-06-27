import { Router } from 'express';
import { checkInController } from '../controllers/checkIn.controller';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { bookingIdParamSchema, updateCheckInSchema } from '../validators/checkIn.validator';

const router = Router();
router.use(requireAuth);

router.get('/:bookingId', validate(bookingIdParamSchema), checkInController.getCheckIn);
router.put('/:bookingId', validate(updateCheckInSchema), checkInController.updateCheckIn);

export default router;
