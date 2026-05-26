import { Router } from 'express';
import { createBooking, getAllBookings } from '../controllers/booking';

const router = Router();

// נתיב לשמירת הזמנה חדשה (מה שעשינו קודם)
router.post('/', createBooking);

// נתיב חדש - שליפת כל ההזמנות הקיימות!
router.get('/', getAllBookings);

export default router;