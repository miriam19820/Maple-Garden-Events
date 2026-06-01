import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import styles from './EventFormManager.module.css';
import CheckCamera from '../CheckCamera/CheckCamera';

interface Booking {
  id: string;
  clientAFullName: string;
  clientAIdNumber: string;
  clientBFullName?: string;
  clientBIdNumber?: string;
  eventDate: {
    date: string;
  };
  guestCount: number;
  eventType: string;
  timeOfDay: string;
  eventForm?: any;
}

interface EventFormData {
  eventTime?: string;
  receptionType?: string;
  finalGuestCount?: number;
  seatingType?: string;
  menPercent?: number;
  womenPercent?: number;
  honorTableCount?: number;
  tableclothId?: string;
  napkinId?: string;
  centerpiece?: string;
  bridgeChair?: string;
  hasLighting?: boolean;
  hasSoundSystem?: boolean;
  hasScreens?: boolean;
  hasFireworks?: boolean;
  entertainersBar?: number;
  entertainersSitting?: number;
  entertainersMen?: number;
  entertainersWomen?: number;
  depositCheckUrl?: string;
  depositCheckStatus?: boolean;
  akumCode?: string;
  kashrut?: string;
  notes?: string;
}

const EventFormManager = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allForms, setAllForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);
  const [viewMode, setViewMode] = useState<'bookings' | 'forms'>('bookings');
  const [formData, setFormData] = useState<EventFormData>({});
  const [depositCheckFile, setDepositCheckFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notesList, setNotesList] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    fetch('http://localhost:5000/api/bookings')
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          const bookedBookings = res.data.filter((b: any) => b.eventDate?.status === 'BOOKED');
          setBookings(bookedBookings);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch('http://localhost:5000/api/event-forms')
      .then(r => r.json())
      .then(forms => setAllForms(forms || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selected) {
      setFormData({});
      setNotesList([]);
      return;
    }
    // טוען את הטופס הקיים מהשרת
    fetch(`http://localhost:5000/api/event-forms/${selected.id}`)
      .then(r => r.json())
      .then(form => {
        if (form && form.id) {
          const { id, createdAt, updatedAt, booking, bookingId, ...cleanForm } = form;
          setFormData(cleanForm);
          setNotesList(form.notes ? JSON.parse(form.notes) : []);
        } else {
          setFormData({});
          setNotesList([]);
        }
      })
      .catch(() => {
        setFormData({});
        setNotesList([]);
      });
  }, [selected]);

  const filtered = bookings.filter(b =>
    b.clientAFullName?.includes(search) ||
    b.clientAIdNumber?.includes(search) ||
    b.clientBFullName?.includes(search) ||
    b.clientBIdNumber?.includes(search)
  );

  const dateStr = (b: Booking) => b.eventDate?.date ? new Date(b.eventDate.date).toLocaleDateString('he-IL') : '';

  const handleInputChange = (field: keyof EventFormData, value: any) => {
    if (field === 'menPercent') {
      const newMenPercent = Math.min(parseInt(value) || 0, 100);
      const womenPercent = 100 - newMenPercent;
      setFormData(prev => ({
        ...prev,
        menPercent: newMenPercent,
        womenPercent: womenPercent
      }));
    } else if (field === 'womenPercent') {
      const newWomenPercent = Math.min(parseInt(value) || 0, 100);
      const menPercent = 100 - newWomenPercent;
      setFormData(prev => ({
        ...prev,
        womenPercent: newWomenPercent,
        menPercent: menPercent
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleCheckboxChange = (field: keyof EventFormData, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setDepositCheckFile(e.target.files[0]);
    }
  };

  const uploadCheckFile = async (): Promise<string | null> => {
    if (!depositCheckFile) return formData.depositCheckUrl || null;

    try {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve(e.target?.result as string);
        };
        reader.readAsDataURL(depositCheckFile);
      });
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleDownloadPDF = async () => {
    if (!selected) return;

    try {
      const response = await fetch(`http://localhost:5000/api/event-forms/${selected.id}/pdf`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `event-form-${selected.clientAFullName}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      alert('שגיאה בהורדת PDF');
    }
  };

  const handleDeleteCheckImage = () => {
    setDepositCheckFile(null);
    setFormData(prev => ({
      ...prev,
      depositCheckUrl: undefined
    }));
  };

  const addNote = () => {
    if (newNote.trim()) {
      setNotesList([...notesList, newNote]);
      setNewNote('');
    }
  };

  const removeNote = (index: number) => {
    setNotesList(notesList.filter((_, i) => i !== index));
  };

  const isFormValid = () => {
    return !!(
      formData.eventTime &&
      formData.receptionType &&
      formData.finalGuestCount &&
      formData.seatingType &&
      (formData.seatingType === 'mixed' || (formData.menPercent && formData.womenPercent)) &&
      formData.depositCheckUrl &&
      formData.kashrut
    );
  };

  const handleSaveForm = async () => {
    if (!selected) return;

    if (!isFormValid()) {
      alert('אנא מלא את כל השדות החובה:\n✓ שעה וקבלת פנים\n✓ סוג ישיבה\n✓ מוזמנים סופיים\n✓ חלוקה (אחוזים)\n✓ צ"ק פיקדון\n✓ כשרות\n\nהערות = אופציונלי');
      return;
    }

    setSubmitting(true);
    try {
      const checkUrl = await uploadCheckFile();

      const dataToSave: EventFormData = {
        ...formData,
        depositCheckUrl: checkUrl || formData.depositCheckUrl,
        notes: JSON.stringify(notesList)
      };

      const response = await fetch(`http://localhost:5000/api/event-forms/${selected.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        const updatedBookings = bookings.map(b =>
          b.id === selected.id ? { ...b, eventForm: result.data } : b
        );
        setBookings(updatedBookings);
        setDepositCheckFile(null);
        setSubmitting(false);
        setSelected(null);
        return;
      } else {
        alert('שגיאה בשמירה: ' + (result.error || 'unknown'));
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('שגיאה בשמירה: ' + (error instanceof Error ? error.message : 'unknown'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/')} className={styles.backBtn}>← חזרה ללוח</button>
        <h2 className={styles.title}>טופס הפקת אירוע</h2>
        {!selected && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setViewMode('bookings')}
              style={{
                padding: '8px 16px',
                background: viewMode === 'bookings' ? '#667eea' : '#ddd',
                color: viewMode === 'bookings' ? 'white' : '#333',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              🔍 חיפוש הזמנה
            </button>
            <button
              onClick={() => setViewMode('forms')}
              style={{
                padding: '8px 16px',
                background: viewMode === 'forms' ? '#667eea' : '#ddd',
                color: viewMode === 'forms' ? 'white' : '#333',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              📋 כל הטפסים
            </button>
          </div>
        )}
      </div>

      {!selected ? (
        <>
          {viewMode === 'bookings' ? (
            <>
              <input
                className={styles.searchInput}
                placeholder="חיפוש לפי שם או תעודת זהות..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              {loading ? (
                <p className={styles.empty}>טוען...</p>
              ) : filtered.length === 0 ? (
                <p className={styles.empty}>{search ? 'לא נמצאו תוצאות.' : 'אין הזמנות סגורות.'}</p>
              ) : (
                <>
                  {/* הזמנות ללא טופס */}
                  {filtered.filter(b => !b.eventForm).length > 0 && (
                    <>
                      <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#e53e3e' }}>⚠️ ממתינות למילוי טופס ({filtered.filter(b => !b.eventForm).length})</p>
                      <div className={styles.grid}>
                        {filtered.filter(b => !b.eventForm).map(b => (
                          <div key={b.id} className={styles.card} onClick={() => setSelected(b)}>
                            <div className={styles.cardDate}>{dateStr(b)}</div>
                            <div className={styles.cardName}>{b.clientAFullName}</div>
                            {b.clientBFullName && <div className={styles.cardName}>{b.clientBFullName}</div>}
                            <div className={styles.cardDetail}>סוג: {b.eventType}</div>
                            <div className={styles.cardDetail}>מוזמנים: {b.guestCount}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {/* הזמנות עם טופס */}
                  {filtered.filter(b => b.eventForm).length > 0 && (
                    <>
                      <p style={{ margin: '20px 0 10px 0', fontWeight: 'bold', color: '#38a169' }}>✓ טפסים שמורים ({filtered.filter(b => b.eventForm).length})</p>
                      <div className={styles.grid}>
                        {filtered.filter(b => b.eventForm).map(b => (
                          <div key={b.id} className={styles.card} onClick={() => setSelected(b)}>
                            <div className={styles.cardDate}>{dateStr(b)}</div>
                            <div className={styles.cardName}>{b.clientAFullName}</div>
                            {b.clientBFullName && <div className={styles.cardName}>{b.clientBFullName}</div>}
                            <div className={styles.cardDetail}>סוג: {b.eventType}</div>
                            <div className={styles.cardDetail}>מוזמנים: {b.guestCount}</div>
                            <div className={styles.cardStatus}>✓ טופס קיים</div>

                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <input
                className={styles.searchInput}
                placeholder="חיפוש לפי שם לקוח..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <p style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
                📊 סה"כ טפסים שנשמרו: {allForms.length}
              </p>
              {allForms.length === 0 ? (
                <p className={styles.empty}>אין טפסים שנשמרו עדיין.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
                  {allForms
                    .filter((form) =>
                      !search ||
                      form.booking?.clientAFullName?.includes(search) ||
                      form.booking?.clientBFullName?.includes(search)
                    )
                    .map((form, idx) => (
                    <div key={idx} style={{
                      padding: '16px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      background: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                    onClick={() => {
                      if (form.booking) {
                        const booking = form.booking as Booking;
                        setSelected(booking);
                      }
                    }}>
                      <h4 style={{ margin: '0 0 8px 0' }}>
                        {form.booking?.clientAFullName || '—'}
                      </h4>
                      <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>
                        📅 {form.booking?.eventDate?.date ? new Date(form.booking.eventDate.date).toLocaleDateString('he-IL') : '—'}
                      </p>
                      <p style={{ margin: '4px 0', fontSize: '12px', color: '#666' }}>
                        👥 {form.finalGuestCount || '—'} מוזמנים
                      </p>
                      <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#999' }}>
                        💾 שמור: {form.createdAt ? new Date(form.createdAt).toLocaleString('he-IL') : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className={styles.formContainer}>
          <div className={styles.formHeader}>
            <h3>{selected.clientAFullName} {selected.clientBFullName ? `+ ${selected.clientBFullName}` : ''}</h3>
            <p>{dateStr(selected)}</p>
            <button onClick={() => setSelected(null)} className={styles.closeBtn}>✕ סגור</button>
          </div>

          <div className={styles.formBody}>
            {/* שעה וקבלת פנים */}
            <div className={styles.section}>
              <h4>📅 שעה וקבלת פנים</h4>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>שעת קבלת פנים</label>
                  <input
                    type="time"
                    value={formData.eventTime || ''}
                    onChange={e => handleInputChange('eventTime', e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label>סוג קבלת פנים</label>
                  <select value={formData.receptionType || ''} onChange={e => handleInputChange('receptionType', e.target.value)}>
                    <option value="">בחר...</option>
                    <option value="separate">נפרד</option>
                    <option value="mixed">מעורב</option>
                  </select>
                </div>
              </div>
            </div>

            {/* מוזמנים וישיבה */}
            <div className={styles.section}>
              <h4>👥 מוזמנים וישיבה</h4>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>כמות מוזמנים סופית</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.finalGuestCount || ''}
                    onChange={e => handleInputChange('finalGuestCount', parseInt(e.target.value))}
                  />
                </div>
                <div className={styles.field}>
                  <label>סוג ישיבה</label>
                  <select value={formData.seatingType || ''} onChange={e => handleInputChange('seatingType', e.target.value)}>
                    <option value="">בחר...</option>
                    <option value="mixed">מעורב</option>
                    <option value="separate">נפרד</option>
                  </select>
                </div>
              </div>

              {formData.seatingType === 'separate' && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>אחוז גברים</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.menPercent || ''}
                      onChange={e => handleInputChange('menPercent', parseInt(e.target.value))}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>אחוז נשים</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.womenPercent || ''}
                      onChange={e => handleInputChange('womenPercent', parseInt(e.target.value))}
                    />
                  </div>
                </div>
              )}

              {formData.seatingType === 'separate' && formData.menPercent && formData.womenPercent && (
                <div className={styles.chartContainer}>
                  {(() => {
                    const totalGuests = formData.finalGuestCount || 0;
                    const menCount = Math.round((formData.menPercent / 100) * totalGuests);
                    const womenCount = totalGuests - menCount;
                    return (
                      <>
                        <div className={styles.chartStats}>
                          <div className={styles.statItem}>
                            <span className={styles.statColor} style={{ backgroundColor: '#2196F3' }}></span>
                            <span>גברים: {formData.menPercent}% ({menCount} אנשים)</span>
                          </div>
                          <div className={styles.statItem}>
                            <span className={styles.statColor} style={{ backgroundColor: '#F44336' }}></span>
                            <span>נשים: {formData.womenPercent}% ({womenCount} אנשים)</span>
                          </div>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={[
                                { name: `גברים (${menCount})`, value: formData.menPercent },
                                { name: `נשים (${womenCount})`, value: formData.womenPercent }
                              ]}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={false}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              <Cell fill="#2196F3" />
                              <Cell fill="#F44336" />
                            </Pie>
                            <Tooltip formatter={(value) => `${value}%`} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* שולחן כבוד */}
            <div className={styles.section}>
              <h4>👑 שולחן כבוד</h4>
              <div className={styles.field}>
                <label>כמות אנשים בשולחן כבוד</label>
                <input
                  type="number"
                  min="0"
                  value={formData.honorTableCount || ''}
                  onChange={e => handleInputChange('honorTableCount', parseInt(e.target.value))}
                />
              </div>
            </div>

            {/* עיצוב */}
            <div className={styles.section}>
              <h4>🎨 עיצוב</h4>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>מפות שולחן</label>
                  <input
                    type="text"
                    placeholder="בחר מפה..."
                    value={formData.tableclothId || ''}
                    onChange={e => handleInputChange('tableclothId', e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label>מפיות</label>
                  <input
                    type="text"
                    placeholder="בחר מפית..."
                    value={formData.napkinId || ''}
                    onChange={e => handleInputChange('napkinId', e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>מרכזי שולחן</label>
                  <input
                    type="text"
                    placeholder="תיאור מרכזי שולחן"
                    value={formData.centerpiece || ''}
                    onChange={e => handleInputChange('centerpiece', e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label>כסא כלה</label>
                  <input
                    type="text"
                    placeholder="תיאור כסא כלה"
                    value={formData.bridgeChair || ''}
                    onChange={e => handleInputChange('bridgeChair', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* ציוד טכני */}
            <div className={styles.section}>
              <h4>⚡ ציוד טכני</h4>
              <div className={styles.checkboxRow}>
                <label>
                  <input
                    type="checkbox"
                    checked={formData.hasLighting || false}
                    onChange={e => handleCheckboxChange('hasLighting', e.target.checked)}
                  />
                  תאורה
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formData.hasSoundSystem || false}
                    onChange={e => handleCheckboxChange('hasSoundSystem', e.target.checked)}
                  />
                  הגברה
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formData.hasScreens || false}
                    onChange={e => handleCheckboxChange('hasScreens', e.target.checked)}
                  />
                  מסכים
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formData.hasFireworks || false}
                    onChange={e => handleCheckboxChange('hasFireworks', e.target.checked)}
                  />
                  זיקוקים
                </label>
              </div>
            </div>

            {/* משמחים */}
            <div className={styles.section}>
              <h4>🎭 משמחים</h4>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>משמחים בר - כמות</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.entertainersBar || ''}
                    onChange={e => handleInputChange('entertainersBar', parseInt(e.target.value))}
                  />
                </div>
                <div className={styles.field}>
                  <label>משמחים בר - גברים</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.entertainersMen || ''}
                    onChange={e => handleInputChange('entertainersMen', parseInt(e.target.value))}
                  />
                </div>
                <div className={styles.field}>
                  <label>משמחים בר - נשים</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.entertainersWomen || ''}
                    onChange={e => handleInputChange('entertainersWomen', parseInt(e.target.value))}
                  />
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>משמחים ישיבה - כמות</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.entertainersSitting || ''}
                    onChange={e => handleInputChange('entertainersSitting', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* צ'ק פיקדון */}
            <div className={styles.section}>
              <h4>💳 צ'ק פיקדון</h4>
              <div className={styles.field}>
                <label>תמונת צ'ק פיקדון</label>
                
                {/* 1. קומפוננטת המצלמה שלנו */}
                <CheckCamera 
                  onCapture={(imageSrc) => {
                    handleInputChange('depositCheckUrl', imageSrc);
                    setDepositCheckFile(null); // מאפסים קובץ אם הועלה כזה קודם
                  }} 
                />

                {/* 2. כפתור העלאת קובץ רגיל (למי שמעדיף מתוך המחשב) */}
                <div className={styles.checkImageOptions} style={{ marginTop: '15px' }}>
                  <button 
                    type="button"
                    className={styles.uploadBtn}
                    onClick={() => document.getElementById('fileInput')?.click()}
                  >
                    📁 העלה תמונה מהמחשב / גלריה
                  </button>
                  <input 
                    type="file"
                    id="fileInput"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </div>

                {/* 3. הצגת חיווי אם יש קובץ או תמונה */}
                {depositCheckFile && (
                  <div className={styles.fileContainer}>
                    <p className={styles.fileName}>✓ {depositCheckFile.name}</p>
                    <button onClick={handleDeleteCheckImage} className={styles.deleteBtn}>🗑️ מחק</button>
                  </div>
                )}
                {formData.depositCheckUrl && !depositCheckFile && (
                  <div className={styles.fileContainer}>
                    <p className={styles.fileName}>✓ צ'ק צולם/צורף בהצלחה</p>
                    <button onClick={handleDeleteCheckImage} className={styles.deleteBtn}>🗑️ מחק</button>
                  </div>
                )}
              </div>
              <div className={styles.checkboxRow}>
                <label>
                  <input
                    type="checkbox"
                    checked={formData.depositCheckStatus || false}
                    onChange={e => handleCheckboxChange('depositCheckStatus', e.target.checked)}
                  />
                  צ'ק קיבל
                </label>
              </div>
            </div>

            {/* אקו"ם */}
            <div className={styles.section}>
              <h4>🎵 אקו״ם</h4>
              <div className={styles.field}>
                <label>קוד אישור אקו״ם</label>
                <input
                  type="text"
                  placeholder='הזן קוד אישור אקו״ם...'
                  value={formData.akumCode || ''}
                  onChange={e => handleInputChange('akumCode', e.target.value)}
                />
              </div>
            </div>

            {/* כשרות */}
            <div className={styles.section}>
              <h4>🕎 כשרות</h4>
              <select value={formData.kashrut || ''} onChange={e => handleInputChange('kashrut', e.target.value)}>
                <option value="">בחר כשרות...</option>
                <option value="bad_reuven">בד רובין</option>
                <option value="machpud">מחפוד</option>
                <option value="other">אחר</option>
              </select>
            </div>

            {/* הערות ממוספרות */}
            <div className={styles.section}>
              <h4>📝 הערות (אופציונלי)</h4>
              <div className={styles.notesContainer}>
                {notesList.length > 0 && (
                  <div className={styles.notesList}>
                    {notesList.map((note, idx) => (
                      <div key={idx} className={styles.noteItem}>
                        <span className={styles.noteNumber}>{idx + 1}.</span>
                        <span className={styles.noteText}>{note}</span>
                        <button onClick={() => removeNote(idx)} className={styles.removeNoteBtn}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.addNoteRow}>
                <input
                  type="text"
                  placeholder="הוסף הערה חדשה..."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && addNote()}
                  className={styles.noteInput}
                />
                <button onClick={addNote} className={styles.addNoteBtn}>+ הוסף</button>
              </div>
            </div>

            {/* כפתורים */}
            <div className={styles.formFooter}>
              <button onClick={() => setSelected(null)} className={styles.cancelBtn}>ביטול</button>
              <button
                onClick={handleDownloadPDF}
                disabled={!isFormValid()}
                className={styles.downloadBtn}
                title={!isFormValid() ? 'אנא מלא את כל השדות החובה' : 'הורד PDF'}
              >
                📥 הורד PDF
              </button>
              <button
                onClick={handleSaveForm}
                disabled={submitting || !isFormValid()}
                className={styles.saveBtn}
              >
                {submitting ? '⏳ שמירה...' : (isFormValid() ? '💾 שמור טופס' : '⚠️ חסרים פרטים חובה')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventFormManager;