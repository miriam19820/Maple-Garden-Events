import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Calendar } from './components/Calendar/Calendar';
import { getTakenSlots, type TimeSlot } from './utils/timeSlot';
import { AppLayout } from './components/AppLayout/AppLayout';
import BookingForm from './components/BookingForm/BookingForm';
import OptionsManager from './components/OptionsManager/OptionsManager';
import BookingsManager from './components/BookingsManager/BookingsManager';
import GreetingBlast from './components/GreetingBlast/GreetingBlast';
import EventFormManager from './components/EventFormManager/EventFormManager';
import OptionPage from './components/optionPage/OptionPage';
import MenuDisplay from './components/MenuDisplay/MenuDisplay';
import { SettingsManager } from './components/SettingsManager/SettingsManager';
import FeedbackPage from './components/FeedbackPage/FeedbackPage';
import FeedbackManager from './components/FeedbackManager/FeedbackManager';
import { Login } from './components/Login/Login'; // ייבוא מסך ההתחברות שיצרנו
import Gallery from './components/Gallery/Gallery';

const CalendarWrapper = () => {
  const navigate = useNavigate();
  return (
    <AppLayout viewportFill>
      <Calendar
        onDateSelect={(day) => {
          navigate('/booking', {
            state: {
              date: day.date,
              hebrewDate: day.hebrewDate,
              takenSlots: Array.from(getTakenSlots(day.bookings || [])),
              blockedSlots: (day.blockedSlots || []) as TimeSlot[],
            },
          });
        }}
      />
    </AppLayout>
  );
};

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <AppLayout>
    <div className="page-content">{children}</div>
  </AppLayout>
);

function App() {
  // בודק אם המנהל כבר התחבר בעבר (האם יש טוקן שמור בדפדפן)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    !!localStorage.getItem('managerToken')
  );

  // פונקציה שתופעל לאחר התחברות מוצלחת ממסך הלוגין
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // רכיב "שומר סף" שמסתיר עמודים אם המשתמש לא מחובר
  const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    if (!isAuthenticated) {
      return <Login onLoginSuccess={handleLoginSuccess} />;
    }
    return <>{children}</>;
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* =======================================
            נתיבים ציבוריים ללקוחות (ללא התחברות) 
            ======================================= */}
        <Route path="/feedback/:token" element={<AppLayout><FeedbackPage /></AppLayout>} />

        {/* =======================================
            נתיבים פרטיים למנהלים (חסומים בסיסמה) 
            ======================================= */}
        <Route path="/" element={<ProtectedRoute><CalendarWrapper /></ProtectedRoute>} />
        <Route path="/booking" element={<ProtectedRoute><AppLayout viewportFill><BookingForm /></AppLayout></ProtectedRoute>} />
        <Route path="/booking/edit/:id" element={<ProtectedRoute><AppLayout viewportFill><BookingForm /></AppLayout></ProtectedRoute>} />
        <Route path="/options-manager" element={<ProtectedRoute><PageShell><OptionsManager /></PageShell></ProtectedRoute>} />
        <Route path="/bookings-manager" element={<ProtectedRoute><PageShell><BookingsManager /></PageShell></ProtectedRoute>} />
        <Route path="/greeting" element={<ProtectedRoute><PageShell><GreetingBlast /></PageShell></ProtectedRoute>} />
        <Route path="/event-form-manager" element={<ProtectedRoute><AppLayout viewportFill><EventFormManager /></AppLayout></ProtectedRoute>} />
        <Route path="/option" element={<ProtectedRoute><AppLayout viewportFill><OptionPage /></AppLayout></ProtectedRoute>} />
        <Route path="/menu" element={<ProtectedRoute><AppLayout fullHeight={false}><MenuDisplay /></AppLayout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><PageShell><SettingsManager /></PageShell></ProtectedRoute>} />
        <Route path="/feedback-manager" element={<ProtectedRoute><PageShell><FeedbackManager /></PageShell></ProtectedRoute>} />
        <Route path="/gallery" element={<AppLayout><Gallery /></AppLayout>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;