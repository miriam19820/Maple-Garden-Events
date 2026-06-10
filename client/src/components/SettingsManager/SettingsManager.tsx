import React, { useState, useEffect } from 'react';
import './SettingsManager.css';
// הוספנו את פונקציית ה-fetch המאובטחת שלנו
import { apiFetch } from '../../services/api';

export const SettingsManager = () => {
  const [globalSettings, setGlobalSettings] = useState<any>({});
  const [extras, setExtras] = useState<any[]>([]);
  const [kashruts, setKashruts] = useState<any[]>([]);
  
  const [newExtra, setNewExtra] = useState({ name: '', category: 'עיצוב', price: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, extrasRes, kashrutRes] = await Promise.all([
        // הוחלף ל-apiFetch
        apiFetch('http://localhost:5000/api/settings/global'),
        apiFetch('http://localhost:5000/api/settings/extras'),
        apiFetch('http://localhost:5000/api/kashrut')
      ]);
      const settingsData = await settingsRes.json();
      const extrasData = await extrasRes.json();
      const kashrutData = await kashrutRes.json();
      
      setGlobalSettings(settingsData);
      setExtras(extrasData);
      setKashruts(kashrutData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching settings:', error);
      alert('שגיאה בטעינת נתונים');
    }
  };

  const saveGlobalSettings = async () => {
    try {
      // הוחלף ל-apiFetch
      await apiFetch('http://localhost:5000/api/settings/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(globalSettings)
      });
      alert('הגדרות נשמרו בהצלחה!');
    } catch (error) {
      alert('שגיאה בשמירת הגדרות');
    }
  };

  const updateKashrut = async (id: string, data: any) => {
    try {
      // הוחלף ל-apiFetch
      const response = await apiFetch(`http://localhost:5000/api/kashrut/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      // הוספנו בדיקה: אם השרת דוחה את הבקשה, נציג לך למה!
      if (!response.ok) {
        alert(`השרת סירב לשמור! קוד שגיאה: ${response.status}. תבדקי את החלון השחור של השרת.`);
        return;
      }

      fetchData();
    } catch (error) {
      alert('שגיאה בתקשורת מול השרת');
    }
  };  
  
  const handleImageUpload = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Image = reader.result as string;
      // עדכון ה-UI מיידית
      setKashruts(prev => prev.map(k => k.id === id ? { ...k, imageUrl: base64Image } : k));
      // שליחה לשרת
      updateKashrut(id, { imageUrl: base64Image });
    };
    reader.readAsDataURL(file);
  };

  const handleAddExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExtra.name || !newExtra.price) return alert('נא למלא שם ומחיר');

    try {
      // הוחלף ל-apiFetch
      await apiFetch('http://localhost:5000/api/settings/extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExtra)
      });
      setNewExtra({ name: '', category: 'עיצוב', price: '' });
      fetchData(); 
    } catch (error) {
      alert('שגיאה בהוספת תוספת');
    }
  };

  const toggleExtraStatus = async (id: string, currentStatus: boolean) => {
    try {
      // הוחלף ל-apiFetch
      await apiFetch(`http://localhost:5000/api/settings/extras/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      fetchData();
    } catch (error) {
      alert('שגיאה בעדכון סטטוס');
    }
  };

  // עדכון מקומי של התאריך בסטייט כדי למנוע קפיצות וניתוקים בזמן ההקלדה
  const handleDateChangeLocal = (id: string, newDate: string) => {
    setKashruts(prev => prev.map(k => k.id === id ? { ...k, validUntil: newDate } : k));
  };

  // פונקציית עזר לפרסור תאריך בטוח לתוך ה-input (מונע את תופעת שנת 0002)
  const formatDateForInput = (dateString: any) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  };

  if (loading) return <div>טוען הגדרות...</div>;

  // שליפת התעודה הראשונה/המרכזית של האולם
  const mainKashrut = kashruts[0];

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>הגדרות מערכת ומחירון</h1>
        <p>ניהול תעריפי בסיס, מע"מ וקטלוג תוספות דינמי</p>
      </div>

      <div className="settings-grid">
        {/* כרטיס תעריפי בסיס */}
        <div className="settings-card">
          <h2>תעריפי בסיס ומערכת</h2>
          <div className="form-group">
            <label>מע"מ נוכחי (%)</label>
            <input 
              type="number" 
              value={globalSettings.vatRate || ''} 
              onChange={e => setGlobalSettings({...globalSettings, vatRate: Number(e.target.value)})} 
            />
          </div>
          <div className="form-group">
            <label>מחיר בסיס ממוצע למנה (₪)</label>
            <input 
              type="number" 
              value={globalSettings.basePricePerPortion || ''} 
              onChange={e => setGlobalSettings({...globalSettings, basePricePerPortion: Number(e.target.value)})} 
            />
          </div>
          <div className="form-group">
            <label>מחיר בסיס לעיצוב אולם (₪)</label>
            <input 
              type="number" 
              value={globalSettings.designBasePrice || ''} 
              onChange={e => setGlobalSettings({...globalSettings, designBasePrice: Number(e.target.value)})} 
            />
          </div>
          <div className="form-group">
            <label>מחיר למנת איש צוות (₪)</label>
            <input 
              type="number" 
              value={globalSettings.staffPortionPrice || ''} 
              onChange={e => setGlobalSettings({...globalSettings, staffPortionPrice: Number(e.target.value)})} 
            />
          </div>
          <div className="form-group">
            <label>מחיר חבילת תאורה (₪)</label>
            <input 
              type="number" 
              value={globalSettings.lightingPrice || ''} 
              onChange={e => setGlobalSettings({...globalSettings, lightingPrice: Number(e.target.value)})} 
            />
          </div>
          <button className="save-btn" onClick={saveGlobalSettings}>שמור הגדרות בסיס</button>
        </div>

        {/* כרטיס קטלוג תוספות */}
        <div className="settings-card">
          <h2>קטלוג תוספות ושדרוגים (דינמי)</h2>
          <form className="add-extra-form" onSubmit={handleAddExtra}>
            <div className="form-group" style={{marginBottom: 0}}>
              <label>שם הפריט</label>
              <input 
                placeholder="לדוג': מכונת עשן" 
                value={newExtra.name} 
                onChange={e => setNewExtra({...newExtra, name: e.target.value})} 
              />
            </div>
            <div className="form-group" style={{marginBottom: 0}}>
              <label>קטגוריה</label>
              <select value={newExtra.category} onChange={e => setNewExtra({...newExtra, category: e.target.value})}>
                <option value="עיצוב">עיצוב</option>
                <option value="טכני">ציוד טכני</option>
                <option value="צוות">צוות והפקה</option>
                <option value="אחר">אחר</option>
              </select>
            </div>
            <div className="form-group" style={{marginBottom: 0}}>
              <label>מחיר (₪)</label>
              <input 
                type="number" 
                value={newExtra.price} 
                onChange={e => setNewExtra({...newExtra, price: e.target.value})} 
              />
            </div>
            <button type="submit" className="add-btn">+</button>
          </form>

          <table className="extras-table">
            <thead>
              <tr>
                <th>שם פריט</th>
                <th>קטגוריה</th>
                <th>מחיר</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {extras.map(extra => (
                <tr key={extra.id}>
                  <td>{extra.name}</td>
                  <td>{extra.category}</td>
                  <td>₪{extra.price}</td>
                  <td>
                    <button 
                      onClick={() => toggleExtraStatus(extra.id, extra.isActive)}
                      className={`status-toggle ${extra.isActive ? 'status-active' : 'status-inactive'}`}
                    >
                      {extra.isActive ? 'פעיל' : 'מוסתר'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* חלון ניהול תעודת כשרות יחידה וכללית לאולם (במקום הטבלה) */}
        <div className="settings-card" style={{gridColumn: '1 / -1'}}>
          <h2>ניהול תעודת כשרות האולם</h2>
          <p style={{color: '#666', fontSize: '14px', marginBottom: '15px'}}>התעודה המועלת כאן תוצג אוטומטית בתוסף הפקת האירועים עבור הלקוח.</p>
          
          {mainKashrut ? (
            <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', alignItems: 'center', backgroundColor: '#fdfdfd', padding: '20px', borderRadius: '8px', border: '1px solid #eaeaea' }}>
              
              <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
                <label style={{fontWeight: 'bold'}}>תאריך תוקף התעודה:</label>
                <input 
                  type="date" 
                  value={formatDateForInput(mainKashrut.validUntil)} 
                  onChange={(e) => handleDateChangeLocal(mainKashrut.id, e.target.value)} 
                  onBlur={(e) => updateKashrut(mainKashrut.id, { validUntil: e.target.value })} 
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>

              <div className="form-group" style={{ flex: '1', minWidth: '250px' }}>
                <label style={{fontWeight: 'bold'}}>העלאת קובץ תעודה חדש:</label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleImageUpload(mainKashrut.id, e.target.files[0])} 
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '120px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#555', marginBottom: '5px' }}>תצוגה מקדימה:</span>
                {mainKashrut.imageUrl ? (
                  <img 
                    src={mainKashrut.imageUrl} 
                    alt="תעודת כשרות" 
                    style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #ddd', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', backgroundColor: '#fff', padding: '4px' }} 
                  />
                ) : (
                  <div style={{ width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ccc', borderRadius: '6px', color: '#999', fontSize: '12px' }}>אין תמונה</div>
                )}
              </div>

            </div>
          ) : (
            <div style={{padding: '20px', textAlign: 'center', color: '#666'}}>טוען נתוני תעודת כשרות...</div>
          )}
        </div>

      </div>
    </div>
  );
};