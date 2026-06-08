import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Calendar } from './components/Calendar/Calendar';
import { getTakenSlots } from './utils/timeSlot';
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

const CalendarWrapper = () => {
  const navigate = useNavigate();
  return (
    <AppLayout>
      <Calendar
        onDateSelect={(day) => {
          navigate('/booking', {
            state: {
              date: day.date,
              hebrewDate: day.hebrewDate,
              takenSlots: Array.from(getTakenSlots(day.bookings || [])),
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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CalendarWrapper />} />
        <Route path="/booking" element={<AppLayout><BookingForm /></AppLayout>} />
        <Route path="/booking/edit/:id" element={<AppLayout><BookingForm /></AppLayout>} />
        <Route path="/options-manager" element={<PageShell><OptionsManager /></PageShell>} />
        <Route path="/bookings-manager" element={<PageShell><BookingsManager /></PageShell>} />
        <Route path="/greeting" element={<PageShell><GreetingBlast /></PageShell>} />
        <Route path="/event-form-manager" element={<AppLayout><EventFormManager /></AppLayout>} />
        <Route path="/option" element={<AppLayout><OptionPage /></AppLayout>} />
        <Route path="/menu" element={<AppLayout fullHeight={false}><MenuDisplay /></AppLayout>} />
        <Route path="/settings" element={<PageShell><SettingsManager /></PageShell>} />
        <Route path="/feedback/:token" element={<AppLayout><FeedbackPage /></AppLayout>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
