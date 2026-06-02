import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styles from './NewOptionForm.module.css';
const OptionForm = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // נתונים מהלוח
  const selectedDates = location.state?.selectedDates || [];
  const [optionNumber] = useState(() => Math.floor(6000 + Math.random() * 1000).toString());

  const [formData, setFormData] = useState({
    createdBy: '',
    clientName: '',
    clientPhone: '',
    eventType: '',
    startTime: '18:00',
    endTime: '00:00',
    optionDeadlineHours: '48', // דד-ליין לאופציה
    clientComments: '',
  });

  const eventTypesList = ['חתונה', 'אירוסין', 'בר מצווה', 'בת מצווה', 'ברית', 'בריתה', 'חינה', 'אירוע חברה/עסקי'];
  const representatives = ['מוישי', 'ציפי', 'שימי'];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      optionNumber,
      selectedDates,
      createdAt: new Date().toISOString(),
      isOption: true
    };

    console.log("שמירת אופציה:", payload);
    alert('האופציה נשמרה בהצלחה!');
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <div className={styles.formCard}>
        <div className={styles.header}>
          <h2 className={styles.title}>ביצוע אופציה חדשה <span className={styles.titleAccent}>| מייפל</span></h2>
        </div>

        <form className={styles.formBody} onSubmit={handleSubmit} style={{ direction: 'rtl' }}>
          
          {/* פרטי בסיס */}
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
            <div className={styles.inputGroup}><label>מספר אופציה</label><input value={optionNumber} readOnly className={styles.input} /></div>
            <div className={styles.inputGroup}>
              <label>נציג מכירות *</label>
              <select name="createdBy" required value={formData.createdBy} onChange={handleChange} className={styles.input}>
                <option value="">בחר נציג...</option>
                {representatives.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          </div>

          {/* פרטי לקוח */}
          <h3 className={styles.sectionTitle}>פרטי לקוח</h3>
          <div className={styles.inputRow}>
            <div className={styles.inputGroup}><label>שם מלא</label><input name="clientName" onChange={handleChange} className={styles.input} /></div>
            <div className={styles.inputGroup}><label>טלפון</label><input name="clientPhone" onChange={handleChange} className={styles.input} /></div>
          </div>

          {/* תאריכים ודד-ליין */}
          <h3 className={styles.sectionTitle}>תאריכים ותוקף</h3>
          <div className={styles.inputRow}>
            <div className={styles.inputGroup}>
              <label>תאריכים נבחרים:</label>
              <div className={styles.input} style={{ background: '#e2e8f0' }}>{selectedDates.join(', ')}</div>
            </div>
            <div className={styles.inputGroup}>
              <label>תוקף אופציה (בשעות):</label>
              <input type="number" name="optionDeadlineHours" value={formData.optionDeadlineHours} onChange={handleChange} className={styles.input} />
            </div>
          </div>

          {/* הגדרות אירוע */}
          <h3 className={styles.sectionTitle}>פרטי אירוע</h3>
          <div className={styles.eventDetailsGrid}>
            <div className={styles.inputGroup}>
              <label>סוג אירוע</label>
              <select name="eventType" onChange={handleChange} className={styles.input}>
                <option value="">בחר סוג...</option>
                {eventTypesList.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <div className={styles.inputGroup} style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}><label>משעה</label><input type="time" name="startTime" value={formData.startTime} onChange={handleChange} className={styles.input} /></div>
              <div style={{ flex: 1 }}><label>עד שעה</label><input type="time" name="endTime" value={formData.endTime} onChange={handleChange} className={styles.input} /></div>
            </div>
          </div>

          <h3 className={styles.sectionTitle}>הערות</h3>
          <textarea name="clientComments" value={formData.clientComments} onChange={handleChange} className={styles.input} rows={3} />

          <div className={styles.actions} style={{ marginTop: '20px' }}>
            <button type="submit" className={styles.submitBtn}>שמירת אופציה</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OptionForm;