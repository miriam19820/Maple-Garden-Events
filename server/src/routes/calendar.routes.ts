import { Router } from 'express';
import { calendarController } from '../controllers/calendar.controller';
import { calendarService } from '../Services/calendar.service';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  calendarBookingDetailsSchema,
  lockDateSchema,
  releaseDateSchema,
  saveOptionHoldSchema,
} from '../validators/calendar.validator';

const router = Router();
router.use(requireAuth);

router.get('/dates',                    calendarController.getAllDates);
router.post('/lock/:dateStr',           validate(lockDateSchema), calendarController.lockDate);
router.post('/release/:dateStr',        validate(releaseDateSchema), calendarController.releaseDate);
router.post('/option/:dateId',          validate(calendarBookingDetailsSchema), calendarController.createOption);
router.post('/book-final/:dateId',      validate(calendarBookingDetailsSchema), calendarController.bookFinal);

router.post('/options', validate(saveOptionHoldSchema), async (req, res) => {
  try {
    const { dates, clientName, clientPhone, clientEmail } = req.body;

    const result = await calendarService.saveOptionHold(
      dates,
      clientName,
      clientPhone,
      clientEmail,
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('שגיאה בשמירת אופציה:', error);
    res.status(500).json({ error: 'אירעה שגיאה בשרת בעת שמירת האופציה' });
  }
});

export default router;