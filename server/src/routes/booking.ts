import { Router } from 'express';
import multer from 'multer';
import { createBooking, getAllBookings, releaseOptions, bumpOption, finalizeBooking, getCancellationStats } from '../controllers/booking';
import { sendGreeting } from '../controllers/greeting';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// הראוט החדש לסטטיסטיקות חייב להיות לפני הראוטים האחרים
router.get('/stats/cancellations', getCancellationStats); 

router.post('/', createBooking);
router.get('/', getAllBookings);
router.post('/release', releaseOptions);
router.post('/bump', bumpOption);
router.post('/finalize', finalizeBooking);
router.post('/send-greeting', upload.single('attachment'), sendGreeting);

export default router;