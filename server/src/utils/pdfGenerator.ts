// puppeteer v24+ is ESM-only, use dynamic import in CommonJS project
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface EventFormPDFData {
  clientAFullName: string;
  clientAIdNumber: string;
  clientBFullName?: string;
  clientBIdNumber?: string;
  eventDate: string;
  guestCount: number;
  eventType: string;
  timeOfDay?: string;
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
    selectedMenu?: string | null;
  };
}

// פיצוח מפתח פריט תפריט: "קטגוריה|||תת-קטגוריה|||פריט"
const MENU_KEY_SEP = '|||';
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const buildSelectedMenuSection = (selectedMenu?: string | null): string => {
  let keys: string[] = [];
  try {
    keys = selectedMenu ? JSON.parse(selectedMenu) : [];
  } catch {
    keys = [];
  }
  if (!keys.length) return '';

  // קיבוץ הפריטים לפי קטגוריה כדי לשמור על מבנה התפריט
  const grouped = new Map<string, string[]>();
  for (const key of keys) {
    const [category = 'תפריט', , item = ''] = key.split(MENU_KEY_SEP);
    if (!item) continue;
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push(item);
  }

  const blocks = [...grouped.entries()].map(([category, items]) => `
    <div style="margin-bottom:8px;">
      <div style="font-weight:bold;color:#2c3e50;margin-bottom:3px;">${escapeHtml(category)}</div>
      <ul class="notes-list">
        ${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
      </ul>
    </div>`).join('');

  return `
  <div class="section">
    <div class="section-title">🍽️ תפריט נבחר (${keys.length} פריטים)</div>
    ${blocks}
  </div>`;
};

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
  .subtitle { text-align: center; color: #666; font-size: 11px; margin-bottom: 16px; }
  .divider { border: none; border-top: 2px solid #2c3e50; margin: 12px 0; }
  .section { margin-bottom: 14px; }
  .section-title { background: #2c3e50; color: white; padding: 4px 10px; font-size: 12px; font-weight: bold; border-radius: 3px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.label { font-weight: bold; width: 35%; color: #444; }
  .notes-list { padding: 4px 8px; }
  .notes-list li { margin-bottom: 3px; }
  .footer { text-align: center; font-size: 10px; color: #999; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 8px; }
  .check-img { max-width: 200px; max-height: 120px; margin-top: 6px; border: 1px solid #ddd; border-radius: 4px; }
</style>
</head>
<body>
  <h1>🌿 גן מייפל אירועים</h1>
  <p class="subtitle">טופס הפקת אירוע | הופק: ${new Date().toLocaleDateString('he-IL')}</p>
  <hr class="divider"/>

  <div class="section">
    <div class="section-title">👤 פרטי לקוחות</div>
    <table>
      ${row('צד א\'', `${data.clientAFullName} | ת"ז: ${data.clientAIdNumber}`)}
      ${data.clientBFullName ? row('צד ב\'', `${data.clientBFullName} | ת"ז: ${data.clientBIdNumber}`) : ''}
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

  ${buildSelectedMenuSection(f.selectedMenu)}

  ${notesList.length > 0 ? `
  <div class="section">
    <div class="section-title">📝 הערות</div>
    <ol class="notes-list">
      ${notesList.map(n => `<li>${n}</li>`).join('')}
    </ol>
  </div>` : ''}

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
