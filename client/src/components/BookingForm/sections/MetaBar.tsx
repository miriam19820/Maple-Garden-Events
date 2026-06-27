import React from 'react';
import styles from '../BookingForm.module.css';
import { useStaffQuery } from '../../../hooks/queries';

const eventTypesList = ['חתונה', 'אירוסין', 'בר מצווה', 'בת מצווה', 'ברית', 'בריתה', 'חינה', 'הרמת כוסית', 'כנס מקצועי', 'אירוע חברה/עסקי', 'השכרת אולם בלי אוכל'];

const MetaBar = ({ formData, handleChange, isOption, orderNumber, optionDurationHours, setOptionDurationHours }: any) => {
  const { data: staffMembers = [] } = useStaffQuery();

  const currentDateDisplay = new Date().toLocaleString('he-IL', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className={styles.metaBar}>
      <div className={styles.inputGroup}>
        <label className={styles.metaLabel}>מספר {isOption ? 'אופציה' : 'הזמנה'}</label>
        <input type="text" value={orderNumber} readOnly className={`${styles.input} ${styles.inputReadonly}`} />
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.metaLabel}>{isOption ? 'מי סגר את האופציה *' : 'שם הנציג / סוכן '}</label>
        <select
          name="createdBy"
          required
          value={formData.createdBy}
          onChange={handleChange}
          className={`${styles.input} ${formData.createdBy ? styles.selectHasValue : styles.selectPlaceholder}`}
        >
          <option value="" disabled hidden>
            {isOption ? 'בחרי מי סגר את האופציה' : 'בחרי נציג מהרשימה'}
          </option>
          {staffMembers.map(member => (
            <option key={member.id} value={member.name}>{member.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.metaLabel}>סוג אירוע{isOption ? '' : ' '}</label>
        <select
          name="eventType"
          required={!isOption}
          value={formData.eventType}
          onChange={handleChange}
          className={`${styles.input} ${formData.eventType ? styles.selectHasValue : styles.selectPlaceholder}`}
        >
          <option value="" disabled hidden>
            {isOption ? 'בחירה (אופציונלי)' : 'בחרי מסוגי האירועים'}
          </option>
          {eventTypesList.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>

      {isOption && (
        <div className={styles.inputGroup}>
          <label className={styles.metaLabel}>תוקף אופציה (בשעות)</label>
          <input type="number" value={optionDurationHours} onChange={(e) => setOptionDurationHours(Number(e.target.value))} className={styles.input} />
        </div>
      )}

      <div className={styles.inputGroup}>
        <label className={styles.metaLabel}>תאריך {isOption ? 'פתיחת האופציה' : 'סגירת האירוע'}</label>
        <input type="text" value={currentDateDisplay} readOnly className={`${styles.input} ${styles.inputReadonly}`} style={{ direction: 'ltr', textAlign: 'right' }} />
      </div>
    </div>
  );
};

export default MetaBar;
