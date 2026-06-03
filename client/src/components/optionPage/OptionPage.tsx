import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import NewOptionForm from '../NewOptionForm/NewOptionForm';
import './OptionPage.css';

const OptionPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // תופסים את התאריכים (מוודאים שזה תואם למה שנשלח ב-navigate)
  const selectedDates = location.state?.selectedDates || location.state?.dates || [];

  if (selectedDates.length === 0) {
    return (
      <div className="option-page-container">
        <h3>לא נבחרו תאריכים לאופציה.</h3>
        <button onClick={() => navigate('/')}>חזור ללוח השנה</button>
      </div>
    );
  }

  return (
    <div className="option-page-container">
      <h1>ביצוע אופציה</h1>
      <div className="selected-dates-info">
        <h3>תאריכים שנבחרו:</h3>
        <p>{selectedDates.join(', ')}</p>
      </div>
      
      {/* כאן הטופס החדש שעיצבנו */}
      <NewOptionForm initialDates={selectedDates} />
    </div>
  );
};

export default OptionPage;