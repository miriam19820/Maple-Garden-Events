import express from 'express';
import cors from 'cors';
import bookingRoutes from './routes/booking';
import menuRoutes from './routes/menu';
import calendarRoutes from './routes/calendar.routes';
import eventFormRoutes from './routes/eventForm.routes';
import optionRoutes from './routes/option.routes'; 
import settingsRoutes from './routes/settings.routes'; // <-- הוספנו את הייבוא הזה

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/api/menu',        menuRoutes);
app.use('/api/calendar',    calendarRoutes);
app.use('/api/bookings',    bookingRoutes);
app.use('/api/event-forms', eventFormRoutes);
app.use('/api/options',     optionRoutes);           
app.use('/api/settings',    settingsRoutes);         // <-- והוספנו את השורה הזו כדי שהשרת יכיר את הנתיב

export default app;