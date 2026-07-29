import { Router, Request, Response } from 'express';
import { createOptionEntry } from '../models/option.model';
import { requireAuth } from '../middlewares/auth';
import { requireRole } from '../middlewares/requireRole';
import { RBAC } from '../config/rbac';
import { catchAsync } from '../middlewares/errorHandler';
import { AppError } from '../utils/AppError';

const router = Router();
router.use(requireAuth);

router.post(
  '/',
  requireRole(...RBAC.MANAGEMENT),
  catchAsync(async (req: Request, res: Response) => {
    const { openedBy, menuId, clientName, eventDate } = req.body;

    if (!openedBy || !menuId || !clientName || !eventDate) {
      throw AppError.badRequest(
        'חסרים נתונים חיוניים: וודא ששם נציג, תפריט, שם לקוח ותאריך הוזנו.',
      );
    }

    const newOption = await createOptionEntry(req.body);

    res.status(201).json({
      success: true,
      message: 'האופציה נוצרה בהצלחה',
      data: newOption,
    });
  }),
);

export default router;
