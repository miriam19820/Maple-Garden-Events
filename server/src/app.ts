import express from 'express';
import cors from 'cors'; // 1. מוסיפים את הייבוא הזה
import bookingRoutes from './routes/booking';
import menuRoutes from './routes/menu'; // ייבוא הנתיב החדש
import calendarRoutes from './routes/calendar.routes';

// ...


const app = express();

// 2. אומרים לשרת לאשר בקשות מהדפדפן של ה-React שלנו
app.use(cors({
  origin: 'http://localhost:5173' 
}));

app.use(express.json());
app.use('/api/menu', menuRoutes); // חיבור הנתיב לשרת\
app.use('/api/calendar', calendarRoutes);

// נתיבים
app.use('/api/bookings', bookingRoutes);

export default app;