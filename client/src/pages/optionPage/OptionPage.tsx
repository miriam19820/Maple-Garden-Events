import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './OptionPage.css'; // הייבוא של קובץ העיצוב החדש

export default function OptionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // תופסים את מערך התאריכים שהועבר מלוח השנה
  const selectedDates = location.state?.dates || [];

  // סטייטים לשמירת פרטי הלקוח
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  const handleSaveOption = async () => {
    if (!clientName || !clientPhone) {
      alert("נא למלא שם וטלפון כדי לשמור את האופציה.");
      return;
    }

    // כאן תגיע קריאת ה-API לשרת כדי לנעול את התאריכים במסד הנתונים
    console.log("שומר אופציה עבור:", clientName, clientPhone, "תאריכים:", selectedDates);
    
    alert("האופציה נשמרה בהצלחה! התאריכים ננעלו באופן זמני.");
    navigate('/'); // חזרה ללוח השנה
  };

  // מנגנון הגנה: אם הגיעו לדף הזה בלי תאריכים בכלל (למשל אם הזינו את הכתובת ישירות)
  if (selectedDates.length === 0) {
    return (
      <div className="fallback-container">
        <h3>לא נבחרו תאריכים לאופציה.</h3>
        <button className="fallback-btn" onClick={() => navigate('/')}>
          חזור ללוח השנה
        </button>
      </div>
    );
  }

  return (
    <div className="option-page-container">
      <h2>שמירת תאריכים כאופציה</h2>
      
      <div className="selected-dates-card">
        <h3>התאריכים שנבחרו:</h3>
        <ul>
          {selectedDates.map((date: string) => (
            <li key={date}><strong>{date}</strong></li>
          ))}
        </ul>
      </div>

      <div className="form-group">
        <label>שם הלקוח:</label>
        <input 
          type="text" 
          value={clientName} 
          onChange={e => setClientName(e.target.value)} 
          placeholder="לדוגמה: ישראל ישראלי"
        />
      </div>

      <div className="form-group">
        <label>טלפון:</label>
        <input 
          type="tel" 
          value={clientPhone} 
          onChange={e => setClientPhone(e.target.value)} 
          placeholder="לדוגמה: 050-1234567"
        />
      </div>

      <button className="submit-option-btn" onClick={handleSaveOption}>
        שמור אופציה ונעל תאריכים
      </button>
    </div>
  );
}