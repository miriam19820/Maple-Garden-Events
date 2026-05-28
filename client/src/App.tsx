import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Calendar } from './components/Calendar/Calendar'; // ודאי שהנתיב נכון אצלך
import BookingForm from './components/BookingForm/BookingForm';
import OptionPage from './pages/optionPage/OptionPage';

// יצרנו קומפוננטת עזר שעוטפת את הלוח כדי להעביר את הניווט לסגירת אירוע
const CalendarWrapper = () => {
  const navigate = useNavigate();
  return (
    <Calendar 
      onDateSelect={(day) => {
        // כשלוחצים על "סגירת אירוע" נעביר לדף ההזמנה עם התאריך
        navigate(`/booking?date=${day.date}`);
      }} 
    />
  );
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* דף הבית - הלוח */}
        <Route path="/" element={<CalendarWrapper />} />
        
        {/* דף סגירת אירוע */}
        <Route path="/booking" element={<BookingForm />} />
        
        {/* דף שמירת אופציה */}
        <Route path="/option" element={<OptionPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;