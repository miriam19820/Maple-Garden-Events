import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import styles from './EventFormManager.module.css';
import CheckCamera from '../CheckCamera/CheckCamera';
import CancellationStats from '../CancellationStats/CancellationStats';
// השארתי את הייבוא, אבל את בחירת הכשרות ננהל כאן כדי שהתמונה בוודאות תעבוד לך
import KashrutSelector from '../KashrutSelector/KashrutSelector';
import MenuSelectionForm from '../MenuSelectionForm/MenuSelectionForm';


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
  entertainersTotal?: number; // הוספנו סה"כ משמחים
  entertainersBar?: number;
  entertainersSitting?: number;
  entertainersMen?: number;
  entertainersWomen?: number;
  depositCheckUrl?: string;
  depositCheckStatus?: boolean;
  akumPaid?: boolean; // תוקן - הופרד מצ'ק פיקדון!
  akumCode?: string;
  kashrut?: string;
  notes?: string;

  menuSelections?: Record<string, string[]> | null; // נוסיף | null לכאן
}

// רשימת ההכשרים
const KASHRUT_LIST = [
  "רובין",
  "מחפוד",
  "לנדא",
  "בדץ קהילות",
  "הרב גרוס",
  'בדץ ע"ח'
];

const EventFormManager = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allForms, setAllForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);
  
  const [viewMode, setViewMode] = useState<'bookings' | 'forms' | 'stats'>('bookings'); 
  
  const [formData, setFormData] = useState<EventFormData>({});
  const [depositCheckFile, setDepositCheckFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notesList, setNotesList] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');

  // ניהול תמונת הכשרות
  const [kashrutImage, setKashrutImage] = useState<string | null>(null);
  const [isKashrutModalOpen, setIsKashrutModalOpen] = useState(false);
  
  // ניהול התפריט (הוספנו סטייט לשליטה על פתיחה וסגירה של המודאל)
  const [selectedMenu, setSelectedMenu] = useState<Record<string, string[]> | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false); 

  const handleMenuSave = (menuSelections: Record<string, string[]>) => {
    setSelectedMenu(menuSelections);
    setIsMenuOpen(false); // סוגר את חלון התפריט אוטומטית אחרי השמירה
    alert("התפריט נשמר כחלק מפרטי האירוע!");
  };

  useEffect(() => {
    // טעינת הזמנות וטפסים
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

    // משיכת תעודת הכשרות הגלובלית מהשרת (כדי שתוצג בטופס)
    fetch('http://localhost:5000/api/kashrut')
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0 && data[0].imageUrl) {
          setKashrutImage(data[0].imageUrl);
        }
      })
      .catch(err => console.error("שגיאה בטעינת תעודת כשרות:", err));
  }, []);

  useEffect(() => {
    if (!selected) {
      setFormData({});
      setNotesList([]);
      return;
    }
    fetch(`http://localhost:5000/api/event-forms/${selected.id}`)
      .then(r => r.json())
      .then(form => {
        if (form && form.id) {
          const { id, createdAt, updatedAt, booking, bookingId, ...cleanForm } = form;
          setFormData(cleanForm);
          setNotesList(form.notes ? JSON.parse(form.notes) : []);
          setSelectedMenu(form.menuSelections || null);
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

  // פונקציית השיתוף החדשה לווצאפ ומייל
  const handleShare = () => {
    if (!selected) return;
    const clientName = `${selected.clientAFullName} ${selected.clientBFullName ? `ו${selected.clientBFullName}` : ''}`;
    const textMsg = `שלום, מצורף עדכון לגבי טופס הפקת אירוע - משפחת ${clientName} בתאריך ${dateStr(selected)}.\nמוזמנים: ${formData.finalGuestCount || 'לא צוין'}.`;
    
    // פתיחת ווצאפ
    window.open(`https://wa.me/?text=${encodeURIComponent(textMsg)}`, '_blank');
    // פתיחת אימייל
    window.setTimeout(() => {
      window.open(`mailto:?subject=${encodeURIComponent(`טופס אירוע: ${clientName}`)}&body=${encodeURIComponent(textMsg)}`, '_blank');
    }, 500);
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
        notes: JSON.stringify(notesList),
        menuSelections: selectedMenu
      };

      const response = await fetch(`http://localhost:5000/api/event-forms/${selected.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
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
        <h2 className={styles.title}>טופס הפקת אירוע</h2>
        {!selected && (
          <div className={styles.viewTabs}>
            <button
              onClick={() => setViewMode('bookings')}
              className={`${styles.tabBtn} ${viewMode === 'bookings' ? styles.tabBtnActive : ''}`}
            >
              חיפוש הזמנה
            </button>
            <button
              onClick={() => setViewMode('forms')}
              className={`${styles.tabBtn} ${viewMode === 'forms' ? styles.tabBtnActive : ''}`}
            >
              כל הטפסים
            </button>
            <button
              onClick={() => setViewMode('stats')}
              className={`${styles.tabBtn} ${styles.tabBtnStats} ${viewMode === 'stats' ? styles.tabBtnActive : ''}`}
            >
              סטטיסטיקות
            </button>
          </div>
        )}
      </div>

      {!selected ? (
        <>
          {viewMode === 'bookings' && (
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
          )}

          {viewMode === 'forms' && (
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
                      padding: '16px', border: '1px solid #ddd', borderRadius: '8px', background: 'white',
                      cursor: 'pointer', transition: 'all 0.3s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                    onClick={() => {
                      if (form.booking) {
                        setSelected(form.booking as Booking);
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

          {viewMode === 'stats' && (
            <div style={{ marginTop: '20px' }}>
              <CancellationStats />
            </div>
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
                  <select value={formData.receptionType || 'separate'} onChange={e => handleInputChange('receptionType', e.target.value)}>
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
                  <select value={formData.seatingType || 'separate'} onChange={e => handleInputChange('seatingType', e.target.value)}>
                    <option value="separate">נפרד</option>
                    <option value="mixed">מעורב</option>
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

            {/* עיצוב עם כפתור לגלריה */}
            <div className={styles.section}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h4 style={{ margin: 0 }}>🎨 עיצוב</h4>
                <button 
                  onClick={() => navigate('/gallery')} 
                  style={{
                    padding: '6px 12px', background: '#ecfdf5', color: '#059669', 
                    border: '1px solid #10b981', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                  }}
                >
                  🖼️ מעבר לגלריה לבחירת תמונות
                </button>
              </div>
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
              <h4>משמחים 🎭</h4>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label>סוג משמחים</label>
                  <select
                    value={
                      formData.entertainersBar !== undefined ? 'bar' :
                      formData.entertainersSitting !== undefined ? 'sitting' : ''
                    }
                    onChange={e => {
                      const type = e.target.value;
                      
                      // איפוס שדות בעת החלפת סוג
                      handleInputChange('entertainersMen', undefined);
                      handleInputChange('entertainersWomen', undefined);
                      
                      if (type === 'bar') {
                        handleInputChange('entertainersBar', 0);
                        handleInputChange('entertainersSitting', undefined);
                      } else if (type === 'sitting') {
                        handleInputChange('entertainersSitting', 0);
                        handleInputChange('entertainersBar', undefined);
                      } else {
                        handleInputChange('entertainersBar', undefined);
                        handleInputChange('entertainersSitting', undefined);
                      }
                    }}
                  >
                    <option value="">בחר סוג...</option>
                    <option value="bar">בר</option>
                    <option value="sitting">ישיבה</option>
                  </select>
                </div>
              </div>

              {/* נציג את השדות רק אם נבחר סוג */}
              {(formData.entertainersBar !== undefined || formData.entertainersSitting !== undefined) && (() => {
                // מזהים מה נבחר ומה הסך הכל הנוכחי
                const isBar = formData.entertainersBar !== undefined;
                const currentTotal = isBar ? (formData.entertainersBar || 0) : (formData.entertainersSitting || 0);

                return (
                  <>
                    <div className={styles.row}>
                      <div className={styles.field}>
                        <label>סה"כ כמות משתתפים</label>
                        <input
                          type="number"
                          min="0"
                          value={currentTotal || ''}
                          onChange={e => {
                            const total = parseInt(e.target.value) || 0;
                            const men = formData.entertainersMen || 0;
                            
                            // מעדכן את השדה הנכון (בר או ישיבה) לפי מה שנבחר
                            handleInputChange(isBar ? 'entertainersBar' : 'entertainersSitting', total);
                            // משלים אוטומטית נשים
                            handleInputChange('entertainersWomen', Math.max(0, total - men));
                          }}
                        />
                      </div>
                    </div>

                    <div className={styles.row}>
                      <div className={styles.field}>
                        <label>כמות גברים</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.entertainersMen || ''}
                          onChange={e => {
                            const men = parseInt(e.target.value) || 0;
                            handleInputChange('entertainersMen', men);
                            // משלים אוטומטית נשים מתוך הסך הכל הקיים
                            handleInputChange('entertainersWomen', Math.max(0, currentTotal - men));
                          }}
                        />
                      </div>
                      <div className={styles.field}>
                        <label>כמות נשים (מושלם אוטומטית)</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.entertainersWomen || ''}
                          readOnly
                          style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed' }}
                        />
                      </div>
                    </div>

                    {/* גרף עוגה למשמחים */}
                    {currentTotal > 0 && (
                      <div className={styles.chartContainer}>
                        {(() => {
                          const entMen = formData.entertainersMen || 0;
                          const entWomen = formData.entertainersWomen || 0;
                          const entMenPercent = ((entMen / currentTotal) * 100).toFixed(0);
                          const entWomenPercent = ((entWomen / currentTotal) * 100).toFixed(0);

                          return (
                            <>
                              <div className={styles.chartStats}>
                                <div className={styles.statItem}>
                                  <span className={styles.statColor} style={{ backgroundColor: '#2196F3' }}></span>
                                  <span>גברים: {entMenPercent}% ({entMen} איש)</span>
                                </div>
                                <div className={styles.statItem}>
                                  <span className={styles.statColor} style={{ backgroundColor: '#F44336' }}></span>
                                  <span>נשים: {entWomenPercent}% ({entWomen} אישה)</span>
                                </div>
                              </div>
                              <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                  <Pie
                                    data={[
                                      { name: `גברים`, value: entMen },
                                      { name: `נשים`, value: entWomen }
                                    ]}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={80}
                                    dataKey="value"
                                  >
                                    <Cell fill="#2196F3" />
                                    <Cell fill="#F44336" />
                                  </Pie>
                                  <Tooltip formatter={(value: any, name: any) => [`${value} משתתפים (${((Number(value) / currentTotal) * 100).toFixed(0)}%)`, name]} />
                                  <Legend />
                                </PieChart>
                              </ResponsiveContainer>
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* צ'ק פיקדון */}
            <div className={styles.section}>
              <h4>💳 צ'ק פיקדון</h4>
              <div className={styles.field}>
                <label>תמונת צ'ק פיקדון</label>
                
                <CheckCamera 
                  onCapture={(imageSrc) => {
                    handleInputChange('depositCheckUrl', imageSrc);
                    setDepositCheckFile(null); 
                  }} 
                />

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
                <label>האם שילם</label>
                {/* תוקן! כבר לא מחובר לצ'ק הפיקדון אלא לשדה משלו akumPaid */}
                <input
                  type="checkbox"
                  checked={formData.akumPaid || false}
                  onChange={e => handleCheckboxChange('akumPaid', e.target.checked)}
                />
              </div>
            </div>

            {/* כשרות */}
            <div className={styles.section}>
              <h4>כשרות</h4>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <select 
                  value={formData.kashrut || ''} 
                  onChange={(e) => handleInputChange('kashrut', e.target.value)}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="">בחר כשרות...</option>
                  {KASHRUT_LIST.map((kName, idx) => (
                    <option key={idx} value={kName}>{kName}</option>
                  ))}
                </select>

                {/* תצוגת התעודה ליד הכשרות! */}
                {kashrutImage ? (
                  <div 
                    onClick={() => setIsKashrutModalOpen(true)}
                    style={{ cursor: 'pointer', width: '50px', height: '50px', border: '2px solid #ddd', borderRadius: '6px', overflow: 'hidden' }}
                    title="לחץ להגדלת התעודה"
                  >
                    <img src={kashrutImage} alt="תעודת כשרות" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div style={{ width: '50px', height: '50px', background: '#f1f5f9', border: '1px dashed #cbd5e1', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#999', textAlign: 'center' }}>
                    אין תמונה בשרת
                  </div>
                )}
              </div>

              {/* מודאל הגדלת התמונה של הכשרות */}
              {isKashrutModalOpen && kashrutImage && (
                <div 
                  onClick={() => setIsKashrutModalOpen(false)}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px' }}
                >
                  <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                    <img src={kashrutImage} alt="תעודה מוגדלת" style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '8px', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }} />
                    <button 
                      onClick={() => setIsKashrutModalOpen(false)}
                      style={{ display: 'block', margin: '20px auto 0', padding: '10px 30px', background: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      סגור חלון
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ---> כפתור בחירת תפריט אלגנטי <--- */}
            <div className={styles.section} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '15px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '20px' }}>
              <div>
                <h4 style={{ margin: '0 0 5px 0' }}>🍽️ תפריט האירוע</h4>
                {selectedMenu ? (
                  <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 'bold' }}>✓ תפריט נבחר ושמור בטופס</span>
                ) : (
                  <span style={{ fontSize: '13px', color: '#64748b' }}>טרם נבחר תפריט לאירוע זה</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                style={{
                  padding: '10px 20px', background: selectedMenu ? '#3b82f6' : '#d4af37', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                }}
              >
                {selectedMenu ? 'ערוך תפריט נבחר' : '📋 בחירת תפריט'}
              </button>
            </div>

            {/* ---> מודאל צף לבחירת תפריט <--- */}
            {/* ---> מודאל צף לבחירת תפריט - בתצוגת מסך מלא <--- */}
           {/* ---> מודאל צף לבחירת תפריט - בתצוגת מסך מלא <--- */}
            {isMenuOpen && (
              <div 
                style={{ position: 'fixed', inset: 0, background: '#f8fafc', display: 'flex', justifyContent: 'center', zIndex: 9999 }}
              >
                <div 
                  onClick={e => e.stopPropagation()} 
                  style={{ width: '100vw', height: '100vh', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                >
                  {/* כפתור סגירה צף ובולט בפינה */}
                  <button 
                    onClick={() => setIsMenuOpen(false)}
                    style={{ position: 'absolute', top: '20px', left: '30px', background: 'white', color: '#ef4444', border: '2px solid #ef4444', borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                    title="סגור חלון"
                  >
                    ✕ סגור וחזור לטופס
                  </button>
                  
                  {/* אזור התוכן המרווח שנגלל על כל המסך */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '40px 20px' }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto', background: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', padding: '30px' }}>
                      <MenuSelectionForm 
                         onSaveMenu={handleMenuSave} 
                         initialSelections={selectedMenu} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
           
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

            {/* כפתורים למטה */}
            <div className={styles.formFooter} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={() => setSelected(null)} className={styles.cancelBtn}>ביטול</button>
              
              <button
                onClick={handleDownloadPDF}
                disabled={!isFormValid()}
                className={styles.downloadBtn}
                title={!isFormValid() ? 'אנא מלא את כל השדות החובה' : 'הורד PDF'}
              >
                📥 הורד PDF
              </button>

              {/* הכפתור החדש - שיתוף ללקוח ומנהל! */}
              <button
                onClick={handleShare}
                disabled={!isFormValid()}
                style={{
                  padding: '10px 20px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: isFormValid() ? 'pointer' : 'not-allowed', fontWeight: 'bold', opacity: isFormValid() ? 1 : 0.6
                }}
                title={!isFormValid() ? 'יש למלא טופס לפני שיתוף' : 'שלח לווצאפ ולמייל'}
              >
                🔗 שתף לקוח/מנהל
              </button>

              <button
                onClick={handleSaveForm}
                disabled={submitting || !isFormValid()}
                className={styles.saveBtn}
                style={{ flexGrow: 1 }}
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