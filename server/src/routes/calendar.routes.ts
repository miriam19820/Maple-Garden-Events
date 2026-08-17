import { Router, Request, Response } from 'express';
import { calendarController } from '../controllers/calendar.controller';
import { calendarService } from '../Services/calendar.service';
import { requireAuth } from '../middlewares/auth';
import { requireRole } from '../middlewares/requireRole';
import { cacheMiddleware, invalidateCache } from '../middlewares/cacheMiddleware';
import { RBAC } from '../config/rbac';
import { validate } from '../middlewares/validate';
import {
  calendarBookingDetailsSchema,
  lockDateSchema,
  releaseDateSchema,
  saveOptionHoldSchema,
} from '../validators/calendar.validator';
import { catchAsync } from '../middlewares/errorHandler';

const router = Router();
router.use(requireAuth);

router.get('/dates', requireRole(...RBAC.CALENDAR_READ), cacheMiddleware('calendar'), calendarController.getAllDates);
router.post('/lock/:dateStr', requireRole(...RBAC.CALENDAR_WRITE), validate(lockDateSchema), calendarController.lockDate);
router.post('/release/:dateStr', requireRole(...RBAC.MANAGER_ONLY), validate(releaseDateSchema), calendarController.releaseDate);
router.post('/option/:dateId', requireRole(...RBAC.CALENDAR_WRITE), validate(calendarBookingDetailsSchema), calendarController.createOption);
router.post('/book-final/:dateId', requireRole(...RBAC.CALENDAR_WRITE), validate(calendarBookingDetailsSchema), calendarController.bookFinal);

router.post(
  '/options',
  requireRole(...RBAC.CALENDAR_WRITE),
  validate(saveOptionHoldSchema),
  catchAsync(async (req: Request, res: Response) => {
    const { dates, clientName, clientPhone, clientEmail } = req.body;

    const result = await calendarService.saveOptionHold(
      (req as any).user.tenantId,
      dates,
      clientName,
      clientPhone,
      clientEmail,
    );
    await invalidateCache('calendar');
    res.status(200).json({ success: true, data: result });
  }),
);

export default router;
