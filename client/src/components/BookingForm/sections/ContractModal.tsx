import React from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { getSignatureDataUrl } from '../../../utils/signature';

const ContractModal = ({ isOpen, onClose, isOption, sigCanvas, setContractSigned, onSignatureSaved, styles }: any) => {
  if (!isOpen) return null;

  return (
    <div className={styles?.menuOverlay || ''} style={{ 
      backgroundColor: 'rgba(0, 0, 0, 0.6)', 
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 10000 
    }}>
      <div style={{ 
        maxWidth: '850px', 
        width: '95%', 
        backgroundColor: '#fff', 
        borderRadius: '16px', 
        overflow: 'hidden', 
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        
        {/* כותרת */}
        <div style={{ backgroundColor: '#f1f5f9', padding: '20px 30px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.5rem', fontWeight: 'bold' }}>{isOption ? 'הצעת מחיר וחוזה (אופציה)' : 'חוזה התקשרות לאירוע'}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.8rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {/* תוכן החוזה */}
        <div style={{ padding: '30px', direction: 'rtl', textAlign: 'right', overflowY: 'auto', flex: 1 }}>
          
          {/* הוספנו עטיפה יחסית כדי לשים את חותמת המים */}
          <div style={{ position: 'relative' }}>
            
            {/* חותמת המים - מופיעה רק באופציה */}
            {isOption && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(-45deg)',
                fontSize: '8rem',
                color: 'rgba(200, 200, 200, 0.25)', // אפור שקוף
                fontWeight: '900',
                pointerEvents: 'none', // העכבר עובר דרך הטקסט
                whiteSpace: 'nowrap',
                zIndex: 10,
                userSelect: 'none'
              }}>
                טיוטה - דוגמא
              </div>
            )}

            <div style={{ 
              height: '400px', 
              overflowY: 'auto', 
              background: '#ffffff', 
              padding: '30px', 
              marginBottom: '25px', 
              border: '1px solid #cbd5e1', 
              borderRadius: '12px', 
              color: '#334155', 
              lineHeight: '1.8', 
              fontSize: '1rem',
              position: 'relative',
              zIndex: 1
            }}>
               <strong style={{ fontSize: '1.2rem', color: '#0f172a' }}>תנאים כלליים להזמנה - גן אירועים מייפל</strong><br/><br/>
               מוסכם בזאת כי כמות המוזמנים שהוזמנה בפתיחת ההזמנה תחייב את המזמין, ובמידה וירצה להקטין או מוזמנים המחיר יעלה לפי כמות ההקטנה לשיקול הנהלת מייפל אירועים.<br/><br/>
               במעמד ההזמנה ינתן סך של 10% מערך ההזמנה, ובנוסף ינתן צ'ק ביטחון על סך המנות בקיזוז המקדמה ובתוספת מנות הרזרבה והתוספות שסוכמו. הצ'ק ינתן כתנאי לפתיחת האולם. תשלום עבור האירוע יתבצע לא יאוחר מ-24 שעות לאחר האירוע. תשלום אקו"ם ופדרציה על ידי המזמין כקבוע בחוק.<br/><br/>
               לא ניתן לדחות אירוע מכל סיבה שהיא למעט כוח עליון כגון - רעידת אדמה ומלחמה.<br/><br/>
               במקום מותקן גנרטור חירום כגיבוי להפסקות חשמל. החלפת חשמל למצב גנרטור כרוכה בזמן של מספר דקות עד להפעלתו המלאה. כמו כן, המקום אינו אחראי לשריפה ו/או גניבה בכל מתחם גן האירועים.<br/><br/>
               אירוע אשר ימשך לאחר השעה 24:00 יחויב בתוספת תשלום של 1800 ש"ח עבור כל שעה נוספת או חלק ממנה. מוסכם בזאת כי הנהלת המקום תוכל להרחיק מהמקום כל אדם או נותני שירותים אשר לא ישמעו למנהל במקום או לנהלים.<br/><br/>
               <strong>ביטול הזמנה:</strong><br/>
               כל ביטול הזמנה מכל סיבה שהיא תחיב את המזמין בתשלום כדלקמן:<br/>
               • סכום המקדמה בכל מצב לא יוחזר.<br/>
               • כל ביטול ההזמנה עד 120 יום לפני האירוע - ישלם המזמין 30% מערך ההזמנה.<br/>
               • עד 90 יום לפני האירוע - ישלם המזמין 50% מערך ההזמנה.<br/>
               • עד 60 יום לפני האירוע - ישלם המזמין 65% מערך ההזמנה.<br/>
               • עד 30 יום לפני האירוע - ישלם המזמין 80% מערך ההזמנה.<br/>
               במידה ויסגר אירוע דומה בתאריך שבוטל, מייפל אירועים תתחשב בגובה הקנס לפי שיקול דעתה. הודעה על ביטול תעשה בכתב בלבד במשרדי מייפל אירועים בחתימת המזמין.<br/><br/>
               חל איסור מוחלט על המזמין ו/או מי מטעמו לחסום את יציאת החירום של גן האירועים מייפל!!!<br/><br/>
               המחיר לא כולל תאורה, הגברה ומסכים. במידה ויש תקליטן באירוע חובה לקחת הגברה דרך האולם (עלות ההגברה 1400 ש"ח). ההגברה המותקנת במקום לא מתאימה טכנית לחיבור ללהקה, לזמר, או הרכב מוזיקלי כזה או אחר. במידה והמזמין מעוניין בהקרנת מצגת או הקרנת האירוע על מסכים, באחריותו שלצלם יש ציוד וכבלים מתאימים למערכת.<br/><br/>
               תשלום עבור עיצוב במחיר של 4500 ש"ח (כולל: חופה, שולחנות) מחויב בכל אירוע. קיימת אפשרות שדרוג בתוספת תשלום.<br/><br/>
               לא ניתן להפעיל זיקוקים, קונפטי או תותחי קונפטי, וחל איסור מוחלט להכניס פריטים אלו למתחם מייפל.<br/><br/>
               הגן מתחייב לספק במידת הצורך כמות נוספת של 10% מהמנות מכמות ההזמנה אשר התחייב המזמין בפועל. פתיחת הרזרבה תעשה לאחר חתימת המזמין או מי מטעמו וישמשו נספח לחוזה המקורי.<br/><br/>
               עריכת השולחנות תעשה לפי סקיצה של 12 מוזמנים סביב כל שולחן.<br/><br/>
               הנהלת מייפל אירועים מאחלת בהצלחה ומזל טוב לבעלי השמחה ותעשה כמיטב יכולתה עם טובי נותני השירותים והצוות המיומן להצלחת האירוע.
            </div>
          </div>

          <div style={{ backgroundColor: '#f0f9ff', padding: '20px', borderRadius: '10px', marginBottom: '25px', border: '1px solid #bae6fd' }}>
            <p style={{ fontSize: '0.95rem', color: '#0369a1', margin: 0, fontWeight: '600' }}>
              בחתימתי אני מאשר/ת את נכונות הפרטים המופיעים בטופס הפקת אירוע זה. כמו כן, אני מצהיר/ה כי קראתי והבנתי את תנאי ההתקשרות והתקנון של גן אירועים מייפל, ואני מסכים/ה להם במלואם.
            </p>
          </div>
          
          {/* אזור חתימה */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <h4 style={{ marginBottom: '15px', color: '#1e293b', fontSize: '1.1rem' }}>חתימת הלקוח:</h4>
            <div style={{ 
              border: '2px solid #94a3b8', 
              background: '#f8fafc', 
              borderRadius: '12px', 
              display: 'inline-block',
              padding: '5px' 
            }}>
              <SignatureCanvas ref={sigCanvas} penColor="#0f172a" canvasProps={{ width: 700, height: 200, style: { cursor: 'crosshair' } }} />
            </div>
          </div>
          
          {/* כפתורים */}
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '30px', paddingBottom: '20px' }}>
            <button type="button" onClick={() => sigCanvas.current?.clear()} style={{ 
              background: '#fff', color: '#ef4444', border: '2px solid #ef4444', 
              padding: '12px 30px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' 
            }}>נקה חתימה 🗑️</button>
            
            <button type="button" onClick={() => {
                const dataUrl = getSignatureDataUrl(sigCanvas);
                if (!dataUrl) return alert('נא לחתום לפני האישור');
                onSignatureSaved?.(dataUrl);
                setContractSigned(true);
                onClose();
              }} 
              style={{ backgroundColor: '#059669', color: 'white', padding: '12px 40px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>
              אני מאשר/ת וחותם/ת ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractModal;