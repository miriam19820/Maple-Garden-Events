# Stitch — Maple Garden Events (Web)

מדריך להדמיית מערכת **מיפל — גן אירועים בעיר** ב-[Google Stitch](https://stitch.withgoogle.com).

---

## לפני שמתחילים

1. פתחי את Stitch ובחרי **Web** (לא App) בכפתור בתחתית תיבת הקלט
2. העתיקי את **פרומפט 1 — מלא** למטה והדביקי בשדה הקלט
3. (אופציונלי) העלי את הלוגו כ-reference: `client/public/logo.svg`
4. אם Stitch לא מייצר את כל המסכים — השתמשי בפרומפטים 2–5 לפי הסדר

---

## מערכת עיצוב

| אלמנט | ערך |
|--------|-----|
| Primary green | `#8CBF8E`, dark `#6BA86E`, deep `#4F8F52` |
| Background | `#F7F8F6` |
| Surface/cards | `#FFFFFF` |
| Text | `#2D3748` / secondary `#4A5568` / muted `#718096` |
| Danger | `#E53E3E` |
| Warning | `#DD6B20` |
| Info | `#4A6FA5` |
| Font | Segoe UI |
| Style | Professional RTL admin tool, soft shadows, 10–14px radius |

---

## פרומפט 1 — מלא (העתיקי הכל)

```
Design a complete Hebrew RTL web admin dashboard for "Maple Garden Events" (מיפל — גן אירועים בעיר), an Israeli event venue management system. Desktop-first, responsive web app (NOT mobile native).

DESIGN SYSTEM:
- Primary: maple green #8CBF8E, dark #6BA86E, deep #4F8F52
- Background #F7F8F6, white cards #FFFFFF
- Text #2D3748, Segoe UI font
- Soft shadows, 10-14px border radius, professional calm admin aesthetic
- Full RTL layout, all UI text in Hebrew
- Logo: maple leaf + "מיפל"

SCREENS TO GENERATE (show as linked prototype flow):

1. LOGIN — Centered white card, maple logo, "התחברות עם Google" button

2. CALENDAR HOME — Main screen:
   - Top header: hamburger menu, logo, page title "לוח שנה"
   - Month grid RTL (columns: שבת→ראשון), Hebrew + Gregorian dates in each cell
   - Color-coded time slots on booked days: morning=light green, afternoon=blue, evening=purple, night=dark
   - Event labels: "חתונה כהן-לוי", "אירוסין שמש-ברק"
   - Filter dropdown "סוג אירוע: חתונה"
   - Month nav arrows, "יוני 2026"
   - Today cell highlighted, one cell shows pulsing "LIVE" badge

3. DAY POPUP MODAL — Over calendar:
   - Date header with Hebrew date
   - Event list with slot colors
   - Buttons: "שמירת אופציה", "סגירת הזמנה", "טופס קבלה באולם" (prominent for LIVE event), "צפייה בחוזה"

4. SAVE OPTION FORM — Short form: pre-filled date, event type, client A/B names, phone, notes, time slot picker (בוקר/צהריים/ערב/לילה), green CTA "שמור אופציה"

5. BOOKING FORM — Multi-section scrollable form:
   - MetaBar: event code, status, date
   - Client A/B details (name, ID, phone, email, address)
   - Event settings (type: חתונה/אירוסין/בר מצווה, date, Hebrew date, time slot, guest count, kashrut)
   - Payment section (base price, VAT 18%, hall extras, external extras, deposit with "סרוק צ'ק" camera button, check fields: number, bank, branch, date)
   - Contract section with signature pad "חתימת לקוח"
   - Green CTA "שמור וסגור הזמנה"

6. OPTIONS MANAGER — Data table: date, names, type, slot, expiry, actions (notify WhatsApp/email, close to booking, delete). Include "הודעת אופציה" modal with message template.

7. BOOKINGS MANAGER — Searchable table (code, date, client, type, guests, status) + detail modal with edit/PDF/production form buttons

8. EVENT PRODUCTION FORM — Booking selector, final guest count, seating split men/women %, menu picker with allergy notes, kashrut cert multi-select, entertainers/DJ/photographer fields, floor plan builder with draggable round/rect tables on canvas, "ייצוא תוכנית ישיבה" button

9. LIVE CHECK-IN MODAL — "אירוע LIVE — ניתן לעריכה" banner, pre-filled fields from booking, live additions table, required signature pad. Show read-only variant with "נסגר" badge after event ends.

10. SETTINGS — Tabs: תמחור (price per guest, VAT, kashrut cost) | שירותים נוספים (editable name+price list) | כשרות (certificates) | משתמשים מורשים (Google emails)

11. FEEDBACK MANAGER — Table: event date, client, food/service/venue star ratings (1-5), notes, "שלח קישור משוב" button

12. PUBLIC FEEDBACK PAGE — Customer-facing, no admin nav, logo + "נשמח לשמוע מכם", 3 star rating groups (אוכל/שירות/אולם), comment field, "שליחה" button

13. GREETING BLAST — Recipient checkbox list from bookings, message editor, file attachment, schedule or immediate send

NAVIGATION DRAWER (slide from right in RTL):
לוח שנה | הגדרות מתחם | ניהול אופציות | ניהול הזמנות | משובי לקוחות | שליחת ברכה | טופס הפקת אירוע | התנתקות

Sample data: wedding Cohen-Levy Aug 15 2026 evening 350 guests (LIVE), option Smach-Barek Sep 22 afternoon, bar mitzvah Abraham Jul 3 morning. Phone 03-6777772. Base price ₪280 per guest.

Make it feel like a polished internal business tool for an Israeli kosher event hall. Consistent header across all admin screens. Modals for popups. Forms use card sections.
```

---

## פרומפט 2 — ליבה (אם פרומפט 1 ארוך מדי)

```
Design a Hebrew RTL web admin dashboard for Israeli event venue "מיפל — גן אירועים בעיר". Desktop-first web app, NOT mobile.

Design system: maple green #8CBF8E / #6BA86E / #4F8F52, background #F7F8F6, white cards, Segoe UI, RTL, all Hebrew labels.

Generate these linked screens:
1. Login — logo + "התחברות עם Google"
2. Calendar home — RTL month grid (שבת→ראשון), Hebrew+Gregorian dates, color-coded slots (morning green, afternoon blue, evening purple, night dark), events "חתונה כהן-לוי" and "אירוסין שמש-ברק", filter "סוג אירוע: חתונה", month "יוני 2026", LIVE badge on today
3. Day popup modal — event list, buttons: שמירת אופציה, סגירת הזמנה, טופס קבלה באולם, צפייה בחוזה
4. Booking form — client A/B, event settings, payment with VAT and "סרוק צ'ק", signature pad, "שמור וסגור הזמנה"
5. Navigation drawer from right: לוח שנה, הגדרות מתחם, ניהול אופציות, ניהול הזמנות, משובי לקוחות, שליחת ברכה, טופס הפקת אירוע, התנתקות

Professional kosher event hall admin tool. Consistent header with hamburger menu.
```

---

## פרומפט 3 — ניהול

```
Add screens to the existing מיפל Hebrew RTL web admin design (keep same maple green #8CBF8E style):

1. OPTIONS MANAGER — Table: תאריך, שמות, סוג, slot, תאריך תפוגה, פעולות (הודע ללקוח, סגור להזמנה, מחק). Search bar. Modal "הודעת אופציה" with WhatsApp/email send.

2. BOOKINGS MANAGER — Searchable table: קוד, תאריך, לקוח, סוג, אורחים, סטטוס. Click row opens detail modal with עריכה, PDF, טופס הפקה buttons.

3. SAVE OPTION FORM — Short form: date, event type, client names, phone, slot picker, "שמור אופציה".

4. SETTINGS — Tabs: תמחור (מחיר לאורח, מע"מ, עלות כשרות), שירותים נוספים (editable list), כשרות, משתמשים מורשים (Google emails).

All Hebrew, RTL, same header and nav drawer as calendar screen.
```

---

## פרומפט 4 — הפקה ולייב

```
Add to existing מיפל Hebrew RTL web admin (maple green #8CBF8E):

1. EVENT PRODUCTION FORM — Select booking, final guest count, seating split % (גברים/נשים), menu picker, kashrut certificates, entertainers/DJ/photographer, floor plan builder canvas with draggable round and rectangular tables, "ייצוא תוכנית ישיבה" button.

2. LIVE CHECK-IN MODAL — Banner "אירוע LIVE — ניתן לעריכה", pre-filled guest count and notes from booking, live additions table (service, quantity, price), required signature pad "חתימת לקוח". Also show closed state: disabled fields + badge "נסגר".

Same design system, Hebrew RTL, admin header.
```

---

## פרומפט 5 — משוב וציבור

```
Add to existing מיפל Hebrew RTL web admin (maple green #8CBF8E):

1. FEEDBACK MANAGER — Admin table: תאריך אירוע, לקוח, star ratings for אוכל/שירות/אולם (1-5), הערות, button "שלח קישור משוב".

2. PUBLIC FEEDBACK PAGE — Customer-facing (NO admin header/nav). Logo, "נשמח לשמוע מכם", three star rating groups (אוכל, שירות, אולם), comment textarea, green "שליחה" button. Clean minimal layout.

3. GREETING BLAST — Checkbox list of booking recipients, rich message editor, file attachment upload, toggle schedule send vs immediate "שליחה מיידית".

Hebrew RTL throughout.
```

---

## פרומפטים לשיפור (אחרי הדמיה ראשונה)

| בעיה | מה לכתוב ב-Stitch |
|------|-------------------|
| לוח שנה לא ברור | `Make the calendar grid more prominent with clearer slot color coding and larger Hebrew dates` |
| טקסט באנגלית | `All labels must be in Hebrew only. Full RTL layout.` |
| חסר מסך ספécifique | `Add screen: [שם המסך] — [תיאור קצר]. Match existing מיפל design system.` |
| טפסים צפופים | `Use card sections with more whitespace between form groups` |

---

## לוגו (Reference Image)

**נתיב מומלץ להעלאה:** `stitch-assets/logo.svg`  
(עותק נוח; המקור: `client/public/logo.svg`)

**איך להעלות ב-Stitch:**
1. לחצי **"+ Start with your design"** או כפתור העלאת תמונה ליד שדה הקלט
2. בחרי את `stitch-assets/logo.svg`
3. הוסיפי לפרומפט: `Use the uploaded logo as brand reference. Maple leaf icon with green tones matching #8CBF8E`

---

## קבצים בפרויקט

| קובץ | שימוש |
|------|--------|
| `STITCH-PROMPT.txt` | פרומפט מלא — העתקה ישירה |
| `STITCH-PROMPT-2-core.txt` | סיבוב 1 — ליבה (לוח שנה, הזמנה, nav) |
| `STITCH-PROMPT-3-management.txt` | סיבוב 2 — ניהול אופציות והזמנות |
| `STITCH-PROMPT-4-production.txt` | סיבוב 3 — הפקה וקבלה LIVE |
| `STITCH-PROMPT-5-feedback.txt` | סיבוב 4 — משוב וברכות |
| `STITCH-SPEC.md` | מדריך מלא (קובץ זה) |
| `stitch-assets/logo.svg` | לוגו ל-reference image |

---

## רשימת מסכים — Checklist

- [ ] Login
- [ ] Calendar Home
- [ ] Day Popup Modal
- [ ] Save Option
- [ ] Booking Form
- [ ] Options Manager
- [ ] Bookings Manager
- [ ] Event Production Form (+ Floor Plan)
- [ ] Live Check-In Modal
- [ ] Settings
- [ ] Feedback Manager
- [ ] Public Feedback Page
- [ ] Greeting Blast
- [ ] Navigation Drawer

---

## נתוני דוגמה

| אירוע | פרטים |
|-------|--------|
| חתונה כהן-לוי | 15.08.2026, ערב, 350 אורחים, **LIVE** |
| אופציה — אירוסין שמש-ברק | 22.09.2026, צהריים |
| בר מצווה משפחת אברהם | 03.07.2026, בוקר |
| טלפון אולם | 03-6777772 |
| מחיר בסיס | ₪280 לאורח |
