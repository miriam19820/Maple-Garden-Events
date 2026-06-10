import express from 'express';
import cors from 'cors';
import helmet from 'helmet'; // <--- הוספנו אבטחה
import rateLimit from 'express-rate-limit'; // <--- הוספנו הגבלת בקשות

// ייבוא קונפיגורציה ושגיאות
import { validateEnv } from './config/env';
import { errorHandler } from './middlewares/errorHandler';

// ייבוא הראוטים
import bookingRoutes from './routes/booking';
import menuRoutes from './routes/menu';
import calendarRoutes from './routes/calendar.routes';
import eventFormRoutes from './routes/eventForm.routes';
import optionRoutes from './routes/option.routes'; 
import settingsRoutes from './routes/settings.routes'; 
import feedbackRoutes from './routes/feedback.routes';
import kashrutRoutes from './routes/kashrut.routes';
import authRoutes from './routes/auth.routes'; // <--- תוקן: הוספנו את ייבוא ראוט ההתחברות

// בדיקת משתני סביבה לפני שהשרת מתחיל לעבוד באמת
validateEnv();

const app = express();

// 1. אבטחה (Security)
app.use(helmet()); // מגן על כותרות ה-HTTP

// הגבלת קצב בקשות (מונע מתקפות DDoS וברוט פורס)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 דקות
  max: 1000, // הגבלה של 1000 בקשות ל-IP ב-15 דקות
  message: 'יותר מדי בקשות מכתובת ה-IP הזו, אנא נסה שוב מאוחר יותר.'
});
app.use('/api', limiter); // מפעילים את ההגבלה רק על ה-API שלנו

// 2. הגדרות כלליות
// בסביבת ייצור, מומלץ לשנות את ה-CORS לכתובת הדומיין האמיתית של הלקוח
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 3. חיבור הראוטים
app.use('/api/auth',        authRoutes); // <--- תוקן: חיבור הראוט שמקשיב ל- /api/auth/login
app.use('/api/kashrut',     kashrutRoutes);
app.use('/api/menu',        menuRoutes);
app.use('/api/calendar',    calendarRoutes);
app.use('/api/bookings',    bookingRoutes);
app.use('/api/event-forms', eventFormRoutes);
app.use('/api/options',     optionRoutes);           
app.use('/api/settings',    settingsRoutes);  
app.use('/api/feedback',    feedbackRoutes);

// 4. ניהול שגיאות מרכזי (תמיד בסוף, אחרי כל הראוטים!)
app.use(errorHandler);

export default app;