import { Router } from 'express';
import multer from 'multer';
import {
  createBooking,
  getAllBookings,
  getBookingById,
  updateBooking,
  releaseOptions,
  bumpOption,
  finalizeBooking,
  getCancellationStats,
  getNextEventCode,
} from '../controllers/booking';
import { sendGreeting } from '../controllers/greeting';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// הראוט החדש לסטטיסטיקות חייב להיות לפני הראוטים האחרים
router.get('/stats/cancellations', getCancellationStats); 
router.get('/next-code', getNextEventCode);

router.post('/', createBooking);
router.get('/', getAllBookings);
router.get('/:id', getBookingById);
router.put('/:id', updateBooking);
router.post('/release', releaseOptions);
router.post('/bump', bumpOption);
router.post('/finalize', finalizeBooking);
router.post('/send-greeting', upload.single('attachment'), sendGreeting);

export default router;