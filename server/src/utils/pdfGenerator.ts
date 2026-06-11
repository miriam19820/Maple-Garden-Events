// puppeteer v24+ is ESM-only, use dynamic import in CommonJS project
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface EventFormPDFData {
  eventCode?: string; // הוספנו את קוד ההזמנה
  clientAFullName: string;
  clientAIdNumber: string;
  clientAPhone?: string; // הוספנו טלפון צד א
  clientAEmail?: string; // הוספנו מייל צד א
  clientBFullName?: string;
  clientBIdNumber?: string;
  clientBPhone?: string; // הוספנו טלפון צד ב
  clientBEmail?: string; // הוספנו מייל צד ב
  eventDate: string;
  guestCount: number;
  eventType: string;
  timeOfDay?: string;
  clientSignatureUrl?: string | null;
  eventForm: {
    eventTime?: string | null;
    receptionType?: string | null;
    finalGuestCount?: number | null;
    seatingType?: string | null;
    menPercent?: number | null;
    womenPercent?: number | null;
    honorTableCount?: number | null;
    tableclothId?: string | null;
    napkinId?: string | null;
    centerpiece?: string | null;
    bridgeChair?: string | null;
    hasLighting?: boolean;
    hasSoundSystem?: boolean;
    hasScreens?: boolean;
    hasFireworks?: boolean;
    entertainersBar?: number | null;
    entertainersSitting?: number | null;
    entertainersMen?: number | null;
    entertainersWomen?: number | null;
    depositCheckUrl?: string | null;
    depositCheckStatus?: boolean;
    akumCode?: string | null;
    kashrut?: string | null;
    notes?: string | null;
  };
}

const translateReceptionType = (type?: string | null) =>
  ({ separate: 'נפרד', mixed: 'מעורב' }[type || ''] || 'לא צוין');

const translateSeatingType = (type?: string | null) =>
  ({ separate: 'נפרד', mixed: 'מעורב' }[type || ''] || 'לא צוין');

const translateKashrut = (k?: string | null) =>
  ({ bad_reuven: 'בד רובין', machpud: 'מחפוד', other: 'אחר' }[k || ''] || k || 'לא צוין');

const row = (label: string, value: string) =>
  `<tr><td class="label">${label}</td><td>${value}</td></tr>`;

export const generateEventFormPDF = async (data: EventFormPDFData): Promise<Buffer> => {
  const f = data.eventForm;
  const formattedDate = format(new Date(data.eventDate), 'd בMMMM yyyy', { locale: he });

  const equipment = [
    f.hasLighting && 'תאורה',
    f.hasSoundSystem && 'הגברה',
    f.hasScreens && 'מסכים',
    f.hasFireworks && 'זיקוקים',
  ].filter(Boolean).join(' | ') || '—';

  let notesList: string[] = [];
  try { notesList = f.notes ? JSON.parse(f.notes) : []; } catch {}

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; direction: rtl; padding: 30px; color: #222; font-size: 13px; }
  h1 { text-align: center; font-size: 22px; margin-bottom: 4px; color: #2c3e50; }
  .subtitle { text-align: center; color: #666; font-size: 12px; margin-bottom: 16px; font-weight: bold; }
  .divider { border: none; border-top: 2px solid #2c3e50; margin: 12px 0; }
  .section { margin-bottom: 14px; }
  .section-title { background: #2c3e50; color: white; padding: 4px 10px; font-size: 12px; font-weight: bold; border-radius: 3px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.label { font-weight: bold; width: 30%; color: #444; }
  .notes-list { padding: 4px 8px; }
  .notes-list li { margin-bottom: 3px; }
  .footer { text-align: center; font-size: 10px; color: #999; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 8px; }
  .check-img { max-width: 200px; max-height: 120px; margin-top: 6px; border: 1px solid #ddd; border-radius: 4px; }
  
  /* עיצוב לאזור החוזה והחתימה */
  .contract-box { margin-top: 20px; padding: 12px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 10.5px; line-height: 1.5; color: #334155; border-radius: 5px; text-align: justify; }
  .signature-box { margin-top: 20px; padding: 15px; border: 2px solid #2c3e50; background: #fff; border-radius: 5px; page-break-inside: avoid; }
  .signature-text { font-size: 11px; color: #000; margin-bottom: 15px; font-weight: bold; text-align: center;}
  .signature-img { max-width: 250px; max-height: 100px; display: block; margin: 0 auto; border-bottom: 1px solid #000; padding-bottom: 5px; }
  .signature-name { text-align: center; font-weight: bold; margin-top: 5px; font-size: 14px;}
</style>
</head>
<body>
  <h1>🌿 גן מייפל אירועים</h1>
  <p class="subtitle">טופס הפקת אירוע וחוזה התקשרות | הופק: ${new Date().toLocaleDateString('he-IL')} | קוד הזמנה: ${data.eventCode || 'לא צוין'}</p>
  <hr class="divider"/>

  <div class="section">
    <div class="section-title">👤 פרטי לקוחות ופרטי אירוע</div>
    <table>
      ${row('קוד הזמנה', `<strong>${data.eventCode || '—'}</strong>`)}
      ${row('צד א\'', `<strong>${data.clientAFullName}</strong> | ת"ז: ${data.clientAIdNumber} <br/> טלפון: ${data.clientAPhone || '—'} | אימייל: ${data.clientAEmail || '—'}`)}
      ${data.clientBFullName ? row('צד ב\'', `<strong>${data.clientBFullName}</strong> | ת"ז: ${data.clientBIdNumber || '—'} <br/> טלפון: ${data.clientBPhone || '—'} | אימייל: ${data.clientBEmail || '—'}`) : ''}
      ${row('תאריך אירוע', formattedDate)}
      ${row('סוג אירוע', data.eventType)}
      ${row('מוזמנים מקורי', String(data.guestCount))}
    </table>
  </div>

  <div class="section">
    <div class="section-title">📅 סידור האירוע</div>
    <table>
      ${row('שעת קבלת פנים', f.eventTime || '—')}
      ${row('סוג קבלת פנים', translateReceptionType(f.receptionType))}
      ${row('מוזמנים סופי', f.finalGuestCount ? String(f.finalGuestCount) : '—')}
      ${row('סוג ישיבה', translateSeatingType(f.seatingType))}
      ${f.seatingType === 'separate' ? row('חלוקה', `גברים: ${f.menPercent}% | נשים: ${f.womenPercent}%`) : ''}
      ${f.honorTableCount ? row('שולחן כבוד', `${f.honorTableCount} אנשים`) : ''}
    </table>
  </div>

  <div class="section">
    <div class="section-title">🎨 עיצוב</div>
    <table>
      ${row('מפות שולחן', f.tableclothId || '—')}
      ${row('מפיות', f.napkinId || '—')}
      ${row('מרכזי שולחן', f.centerpiece || '—')}
      ${row('כסא כלה', f.bridgeChair || '—')}
    </table>
  </div>

  <div class="section">
    <div class="section-title">⚡ ציוד טכני</div>
    <table>${row('ציוד', equipment)}</table>
  </div>

  ${(f.entertainersBar || f.entertainersSitting) ? `
  <div class="section">
    <div class="section-title">🎭 משמחים</div>
    <table>
      ${f.entertainersBar ? row('משמחים בר', `${f.entertainersBar} (גברים: ${f.entertainersMen || 0}, נשים: ${f.entertainersWomen || 0})`) : ''}
      ${f.entertainersSitting ? row('משמחים ישיבה', String(f.entertainersSitting)) : ''}
    </table>
  </div>` : ''}

  <div class="section">
    <div class="section-title">✅ אישורים</div>
    <table>
      ${row('צ\'ק פיקדון', f.depositCheckStatus ? 'התקבל ✓' : 'טרם התקבל')}
      ${f.akumCode ? row('קוד אקו"ם', f.akumCode) : ''}
      ${row('כשרות', translateKashrut(f.kashrut))}
    </table>
    ${f.depositCheckUrl ? `<img class="check-img" src="${f.depositCheckUrl}" alt="צ'ק פיקדון"/>` : ''}
  </div>
  
  ${notesList.length > 0 ? `
  <div class="section">
    <div class="section-title">📝 הערות</div>
    <ol class="notes-list">
      ${notesList.map(n => `<li>${n}</li>`).join('')}
    </ol>
  </div>` : ''}

  <div class="contract-box">
    <strong style="font-size: 12px; text-decoration: underline;">תנאים כלליים להזמנה:</strong><br/><br/>
    מוסכם בזאת כי כמות המוזמנים שהוזמנה בפתיחת ההזמנה תחייב את המזמין, ובמידה וירצה להקטין את כמות המוזמנים המחיר יעלה לפי כמות ההקטנה לשיקול הנהלת מייפל אירועים.<br/>
    במעמד ההזמנה ינתן סך של 10% מערך ההזמנה, ובנוסף ינתן צ'ק ביטחון על סך המנות בקיזוז המקדמה ובתוספת מנות הרזרבה והתוספות שסוכמו. הצ'ק ינתן כתנאי לפתיחת האולם. תשלום עבור האירוע יתבצע לא יאוחר מ-24 שעות לאחר האירוע. תשלום אקו"ם ופדרציה על ידי המזמין כקבוע בחוק. לא ניתן לדחות אירוע מכל סיבה שהיא למעט כוח עליון כגון - רעידת אדמה ומלחמה.<br/>
    במקום מותקן גנרטור חירום כגיבוי להפסקות חשמל. החלפת חשמל למצב גנרטור כרוכה בזמן של מספר דקות עד להפעלתו המלאה. כמו כן, המקום אינו אחראי לשריפה ו/או גניבה בכל מתחם גן האירועים.<br/>
    אירוע אשר ימשך לאחר השעה 24:00 יחויב בתוספת תשלום של 1800 ש"ח עבור כל שעה נוספת או חלק ממנה. מוסכם בזאת כי הנהלת המקום תוכל להרחיק מהמקום כל אדם או נותני שירותים אשר לא ישמעו למנהל במקום או לנהלים.<br/>
    <strong>ביטול הזמנה:</strong><br/>
    כל ביטול הזמנה מכל סיבה שהיא תחייב את המזמין בתשלום כדלקמן:<br/>
    • סכום המקדמה בכל מצב לא יוחזר.<br/>
    • כל ביטול ההזמנה עד 120 יום לפני האירוע ישלם המזמין 30% מערך ההזמנה.<br/>
    • עד 90 יום לפני האירוע ישלם המזמין 50% מערך ההזמנה.<br/>
    • עד 60 יום לפני אירוע שהם המזמין 65% מערך ההזמנה.<br/>
    • עד 30 יום לפני אירוע ישלם המזמין 80% מערך ההזמנה.<br/>
    במידה ויסגר אירוע דומה בתאריך שבוטל מייפל אירועים תתחשב בגובה הקנס לפי שיקול דעתה הודעה על ביטול תעשה בכתב בלבד במשרדי מייפל אירועים בחתימת המזמין.<br/>
    חל איסור מוחלט על המזמין ו/או מי מטעמו לחסום את יציאת החירום של גן האירועים מייפל!!!<br/>
    המחיר לא כולל תאורה, הגברה, ומסכים. במידה ויש תקליטן באירוע חובה לקחת הגברה דרך האולם עלות ההגברה 1400 ש"ח. ההגברה מותקנת במקום לא מתאימה טכנית לחיבור ללהקה, לזמר, הרכב מוזיקלי כזה או אחר.<br/>
    במידה והמזמין מעוניין בהקרנת מצגת או הקרנת האירוע על מסכים באחריותו שלצלם יש ציוד וכבלים מתאימים למערכת.<br/>
    תשלום עבור עיצוב במחיר של 4500 ש"ח שכולל: חופה, שולחנות, מחוייב בכל אירוע אפשרות שדרוג בתוספת תשלום. לא ניתן להפעיל זיקוקים, וקונפטי או תותחי קונפטי, וחל איסור מוחלט להכניס פרטים אלו למתחם מייפל.<br/>
    הגן מתחייב לספק במידת הצורך כמות נוספת של 10% מהמנות מכמות ההזמנה, אשר התחייב המזמין בפועל. פתיחת הרזרבה תעשה לאחר חתימת המזמין או מי מטעמו וישמשו נספח לחוזה המקורי.<br/>
    עריכת השולחנות תעשה לפי סקיצה של 12 מוזמנים סביב כל השולחן.<br/>
    הנהלת מייפל אירועים מאחלת בהצלחה ומזל טוב לבעלי השמחה ותעשה כמיטב יכולתה עם טובי נותני השירותים והצוות המיומן להצלחת האירוע.
  </div>

  ${data.clientSignatureUrl ? `
  <div class="signature-box">
    <p class="signature-text">
      בחתימתי אני מאשר/ת את נכונות הפרטים המופיעים בטופס הפקת אירוע זה. כמו כן, אני מצהיר/ה כי קראתי והבנתי את תנאי ההתקשרות והתקנון של גן אירועים מייפל לעיל, ואני מסכים/ה להם במלואם.
    </p>
    <img class="signature-img" src="${data.clientSignatureUrl}" alt="חתימת הלקוח" />
    <p class="signature-name">נחתם על ידי: ${data.clientAFullName}</p>
  </div>
  ` : ''}

  <div class="footer">גן מייפל אירועים | טופס זה הופק אוטומטית</div>
</body>
</html>`;

  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};