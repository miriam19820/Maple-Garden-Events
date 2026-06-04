import React, { useState, useEffect } from 'react';
import './SettingsManager.css';

export const SettingsManager = () => {
  const [globalSettings, setGlobalSettings] = useState<any>({});
  const [extras, setExtras] = useState<any[]>([]);
  
  const [newExtra, setNewExtra] = useState({ name: '', category: 'עיצוב', price: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, extrasRes] = await Promise.all([
        fetch('http://localhost:5000/api/settings/global'),
        fetch('http://localhost:5000/api/settings/extras')
      ]);
      const settingsData = await settingsRes.json();
      const extrasData = await extrasRes.json();
      
      setGlobalSettings(settingsData);
      setExtras(extrasData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching settings:', error);
      alert('שגיאה בטעינת נתונים');
    }
  };

  const saveGlobalSettings = async () => {
    try {
      await fetch('http://localhost:5000/api/settings/global', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(globalSettings)
      });
      alert('הגדרות נשמרו בהצלחה!');
    } catch (error) {
      alert('שגיאה בשמירת הגדרות');
    }
  };

  const handleAddExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExtra.name || !newExtra.price) return alert('נא למלא שם ומחיר');

    try {
      await fetch('http://localhost:5000/api/settings/extras', {
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
      await fetch(`http://localhost:5000/api/settings/extras/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      fetchData();
    } catch (error) {
      alert('שגיאה בעדכון סטטוס');
    }
  };

  if (loading) return <div>טוען הגדרות...</div>;

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>הגדרות מערכת ומחירון</h1>
        <p>ניהול תעריפי בסיס, מע"מ וקטלוג תוספות דינמי</p>
      </div>

      <div className="settings-grid">
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
              {extras.length === 0 && (
                <tr><td colSpan={4} style={{textAlign: 'center'}}>לא הוזנו תוספות עדיין</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};