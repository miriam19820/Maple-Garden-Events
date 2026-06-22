import { Router } from 'express';
import { checkInController } from '../controllers/checkIn.controller';

const router = Router();

router.get('/:bookingId', checkInController.getCheckIn);
router.put('/:bookingId', checkInController.updateCheckIn);

export default router;
