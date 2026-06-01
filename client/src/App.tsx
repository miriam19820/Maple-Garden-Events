import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Calendar } from './components/Calendar/Calendar';
import BookingForm from './components/BookingForm/BookingForm';
import OptionsManager from './components/OptionsManager/OptionsManager';
import BookingsManager from './components/BookingsManager/BookingsManager';
import EventFormManager from './components/EventFormManager/EventFormManager';

const CalendarWrapper = () => {
  const navigate = useNavigate();
  return (
    <Calendar 
      onDateSelect={(day) => {
        navigate('/booking', { state: { date: day.date, hebrewDate: day.hebrewDate } });
      }} 
    />
  );
};

const OptionsManagerPage = () => {
  const navigate = useNavigate();
  return (
    <div style={{ direction: 'rtl', padding: '20px' }}>
      <button onClick={() => navigate('/')} style={{ background: '#e2e8f0', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '20px' }}>← חזרה ללוח</button>
      <OptionsManager />
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CalendarWrapper />} />
        <Route path="/booking" element={<BookingForm />} />
        <Route path="/options-manager" element={<OptionsManagerPage />} />
        <Route path="/bookings-manager" element={<BookingsManager />} />
        <Route path="/event-form-manager" element={<EventFormManager />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;