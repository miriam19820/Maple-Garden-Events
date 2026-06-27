import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import { validateEnv } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { csrfProtection } from './middlewares/csrf';
import { requestLogger } from './middlewares/requestLogger';

import bookingRoutes from './routes/booking';
import menuRoutes from './routes/menu';
import calendarRoutes from './routes/calendar.routes';
import eventFormRoutes from './routes/eventForm.routes';
import optionRoutes from './routes/option.routes';
import settingsRoutes from './routes/settings.routes';
import feedbackRoutes from './routes/feedback.routes';
import kashrutRoutes from './routes/kashrut.routes';
import authRoutes from './routes/auth.routes';
import checkInRoutes from './routes/checkIn.routes';

validateEnv();

const app = express();
const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(helmet());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'יותר מדי בקשות מכתובת ה-IP הזו, אנא נסה שוב מאוחר יותר.' },
});
app.use('/api', apiLimiter);

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'יותר מדי פעולות כתיבה. נסה שוב מאוחר יותר.' },
});
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  next();
});

const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד כמה דקות.' },
});
app.use('/api/auth/login', authLoginLimiter);

const authRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'יותר מדי בקשות refresh. נסה שוב מאוחר יותר.' },
});
app.use('/api/auth/refresh', authRefreshLimiter);

app.use(cors({
  origin: clientOrigin,
  credentials: true,
  optionsSuccessStatus: 200,
}));

app.use(cookieParser());
app.use(csrfProtection);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(requestLogger);

app.use('/api/check-in', checkInRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/kashrut', kashrutRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/event-forms', eventFormRoutes);
app.use('/api/options', optionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/feedback', feedbackRoutes);

app.use(errorHandler);

export default app;
