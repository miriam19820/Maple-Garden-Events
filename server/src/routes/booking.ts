import { Router } from 'express';
import { createBooking, getAllBookings, releaseOptions, bumpOption } from '../controllers/booking';

const router = Router();

// נתיב לשמירת הזמנה חדשה (מה שעשינו קודם)
router.post('/', createBooking);

// נתיב - שליפת כל ההזמנות הקיימות!
router.get('/', getAllBookings);

// נתיב לשחרור אופציות (תאריכים שלא נסגרו)
router.post('/release', releaseOptions);

// נתיב חדש - הקפצת לקוח (קיצור דד-ליין ל-3 שעות)
router.post('/bump', bumpOption);

export default router;