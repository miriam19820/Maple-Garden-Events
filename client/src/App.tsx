import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Calendar } from './components/Calendar/Calendar';
import BookingForm from './components/BookingForm/BookingForm';
import OptionsManager from './components/OptionsManager/OptionsManager';
import BookingsManager from './components/BookingsManager/BookingsManager';

// --- הייבואים מהענף שלך ---
import GreetingBlast from './components/GreetingBlast/GreetingBlast';

// --- הייבואים מהענף השני ---
import EventFormManager from './components/EventFormManager/EventFormManager';
import OptionPage from './components/optionPage/OptionPage';
import MenuDisplay from './components/MenuDisplay/MenuDisplay';

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
        
        {/* -- הראוט מהענף שלך -- */}
        <Route path="/greeting" element={<GreetingBlast />} />
        
        {/* -- הראוטים מהענף השני -- */}
        <Route path="/event-form-manager" element={<EventFormManager />} />
        <Route path="/option" element={<OptionPage />} />
        <Route path="/menu" element={<MenuDisplay />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;