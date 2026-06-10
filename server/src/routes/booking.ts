import { Router } from 'express';
import multer from 'multer';
import { validate } from '../middlewares/validate';
import { createBookingSchema } from '../validators/booking.validator';
import { requireAuth } from '../middlewares/auth';

import {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBooking,
  releaseOptions,
  bumpOption,
  finalizeBooking,
  getCancellationStats,
  addEventAddition,     // מהגרסה שלך
  getNextEventCode,     // מהגרסה של מרים
} from '../controllers/booking';
import { sendGreeting } from '../controllers/greeting';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });


// הראוטים השונים
router.get('/stats/cancellations', getCancellationStats); 
router.get('/next-code', getNextEventCode); // השאירי את זה

router.post('/', validate(createBookingSchema), createBooking);
router.get('/', getAllBookings);
router.get('/:id', getBookingById);
router.put('/:id', updateBooking);
router.post('/release', releaseOptions);
router.post('/bump', bumpOption);
router.post('/finalize', finalizeBooking);
router.post('/send-greeting', upload.single('attachment'), sendGreeting);
router.post('/', requireAuth, validate(createBookingSchema), createBooking);

// הנתיב לשמירת תוספות בזמן אירוע
router.post('/:id/additions', addEventAddition); // השאירי את זה

export default router;