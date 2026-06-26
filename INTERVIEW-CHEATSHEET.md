# Maple Garden Events — דף עזר לראיון (עברית)

השתמש/י בזה כהערות לדיבור. תרגל/י בקול את **ה-pitch של 30 שניות** ואת **גרסת 2 הדקות**.

---

## 1. זהות הפרויקט

| שדה | מה לומר |
|--------|-------------|
| **שם הפרויקט** | Maple Garden Events — מערכת לניהול אולם אירועים |
| **סוג** | אפליקציית web full-stack (מקרה שימוש עסקי אמיתי) |
| **התפקיד שלך** | מפתח/ת full-stack — frontend, backend, בסיס נתונים, ומסירת פיצ'רים end-to-end |
| **הבעיה שהיא פותרת** | מחליפה תהליכי נייר/ידניים בהזמנת אירועים, ניהול אופציות, חוזים, טפסי הפקה, וקבלה באולם בזמן אירוע חי |

---

## 2. Elevator Pitch

### 30 שניות

> "בניתי מערכת full-stack לניהול אולם אירועים. המנהלים משתמשים בה לניהול לוח שנה, יצירת אופציות והזמנות, הפקת חוזים דיגיטליים ו-PDF, מילוי טפסי הפקה, וקליטת פרטי קבלה באולם בזמן אירוע חי. בצד הלקוח **React ו-TypeScript**, בצד השרת **Node.js, Express ו-Prisma**, ובסיס נתונים **PostgreSQL**."

### 2 דקות (אם אומרים "ספר/י לי עוד")

> "המערכת מכסה את מחזור החיים המלא של אירוע: קודם נשמרת **אופציה** בלוח השנה, ואז היא הופכת ל**הזמנה מאושרת** עם תמחור, מע"מ, הנחות וחתימה דיגיטלית. הצוות משתמש ב**טופס הפקת אירוע** למספר אורחים, תפריט, חלוקת ישיבה וסידור שולחנות. ביום האירוע, **טופס קבלה באולם** נפתח מלוח השנה — ממולא מראש מנתוני ההזמנה, ניתן לעריכה רק במהלך האירוע, לצפייה בלבד אחריו, עם חתימת לקוח חובה.
>
> מבחינה טכנית זו **ארכיטקטורת client–server** מופרדת: React SPA שמדבר עם REST API, עם **JWT + Google OAuth** לגישת מנהלים, **Socket.io** לעדכוני לוח שנה בזמן אמת, ו-**Puppeteer** להפקת PDF. השתמשתי ב-**TypeScript** בשני הצדדים וב-**Prisma** לגישה type-safe לבסיס הנתונים ול-migrations."

---

## 3. Tech Stack — עזר מהיר

### Frontend

- **React 19** + **TypeScript**
- **Vite** (כלי build ושרת פיתוח)
- **React Router** (ניווט בין דפים)
- **CSS Modules** (עיצוב scoped לרכיב)
- **Axios** (HTTP client)
- **Zustand** (state בצד הלקוח)
- **Socket.io Client** (עדכונים בזמן אמת)
- **react-signature-canvas** (חתימות דיגיטליות)
- **react-webcam** (צילום ממצלמה, למשל צ'קים לפיקדון)
- **Tesseract.js** (OCR לסריקת צ'קים בנקאיים)
- **Recharts** (גרפים ודוחות)
- **Google OAuth** (`@react-oauth/google`)

### Backend

- **Node.js** + **Express 5** + **TypeScript**
- **Prisma ORM** + **PostgreSQL**
- **Zod** (validation לבקשות)
- **JWT** + **Google Auth Library** (אימות)
- **Helmet** + **express-rate-limit** (אבטחה)
- **Socket.io** (WebSockets)
- **Puppeteer** (PDF מ-HTML)
- **Nodemailer** (אימייל)
- **Multer** (העלאת קבצים)
- **node-cron** (משימות מתוזמנות)
- **Hebcal** (לוח שנה עברי / כללי עסק)

### ארכיטקטורה וכלים

- **REST API** תחת `/api/*`
- תיקיות **client ו-server** נפרדות
- **משתני סביבה** (`.env`) לסודות
- **Prisma migrations** לשינויי schema
- **Git** לניהול גרסאות

---

## 4. פיצ'רים עיקריים (מה שבנית)

תגיד/י את אלה כ**פיצ'רים עסקיים**, לא רק טכנולוגיה:

| פיצ'ר | הסבר בשורה אחת |
|---------|----------------------|
| **Calendar** | לוח שנה ויזואלי לאופציות ואירועים מוזמנים, חלונות זמן, עדכונים חיים |
| **Option & booking flow** | אופציה → אירוע מאושר עם תמחור, תוספות, מע"מ ותנאי תשלום |
| **Digital contract** | חתימת לקוח + חוזה PDF להדפסה/הורדה |
| **Event production form** | מספר אורחים, תפריט, חלוקת ישיבה, מביאי כיף, עורך סידור שולחנות |
| **Hall reception form (Check-in)** | נפתח ביום האירוע מלוח השנה; מילוי אוטומטי; חתימה חובה; read-only אחרי האירוע |
| **Bookings manager** | חיפוש, צפייה ועריכה של הזמנות קיימות |
| **Options manager** | ניהול אופציות פתוחות |
| **Feedback system** | איסוף משוב מלקוחות |
| **Admin auth** | התחברות Google + allowlist של אימיילים מורשים |
| **PDF generation** | חוזים ומסמכי פרטי אירוע |
| **OCR for checks** | סריקת צ'קי פיקדון מבנקים ישראליים |
| **Navigation UX** | כפתור חזרה גלובלי, header עקבי, דפוסי סגירת modal |

---

## 5. ארכיטקטורה (דיאגרמה פשוטה להסבר)

```
Browser (React + TypeScript)
        ↕  REST API (Axios)  +  WebSockets (Socket.io)
Server (Express + TypeScript)
        ↕  Prisma ORM
PostgreSQL Database
```

**משפט אחד:**

> "ה-client ב-React קורא ל-REST endpoints ב-Express; Prisma ממפה מודלים כמו Booking, EventForm ו-EventCheckIn ל-PostgreSQL; Socket.io דוחף שינויים בלוח השנה בלי refresh."

---

## 6. בסיס נתונים / מודל נתונים (אם שואלים)

ישויות עיקריות שאפשר להזכיר:

- **Booking** — לקוחות, תאריך, מספר אורחים, תמחור, סטטוס, חתימות
- **EventForm** — פרטי הפקה (שעה, תפריט, ישיבה, מביאי כיף)
- **EventCheckIn** — נתוני קבלה באולם בזמן אמת, מקושרים להזמנה
- **CalendarDate** — תאריכים בלוח השנה עם הזמנות מקושרות
- **AuthorizedEmail** — מי יכול להתחבר כמנהל

**משפט לדוגמה:**

> "תכננתי מודלים relational עם Prisma — למשל, ל-Booking אחד יש EventForm אופציונלי אחד ו-EventCheckIn אופציונלי אחד, עם foreign keys ו-migrations כשמוסיפים שדות כמו minimumGuestCount."

---

## 7. נקודות טכניות מרשימות

בחר/י 2–3 שאת/ה מרגיש/ה בנוח להסביר לעומק:

1. **מסירת פיצ'ר end-to-end** — UI + API + DB + PDF (למשל שדה minimum portions)
2. **לוגיקה עסקית מבוססת זמן** — utility של `eventStart`: מתי check-in ניתן לצפייה לעומת עריכה
3. **אבטחה** — אימות OAuth בצד השרת, JWT, rate limiting, Helmet
4. **PDF pipeline** — HTML template → Puppeteer → PDF buffer → download/email
5. **Real-time UX** — Socket.io לסנכרון לוח שנה
6. **Validation** — Zod בשרת, validation בטפסים בלקוח
7. **חתימות דיגיטליות** — capture ב-canvas, שמירה ו-validation לפני save

---

## 8. אתגרים ואיך פתרת אותם (פורמט STAR)

### דוגמה 1 — מסך לבן / import של CSS

- **Situation:** האפליקציה קרסה עם מסך ריק אחרי הוספת modal של check-in
- **Task:** למצוא את שורש הבעיה ולתקן בלי לשבור מודולים אחרים
- **Action:** עקבתי אחרי שגיאת Vite — קובץ `.css` רגיל יובא כ-default module; העברתי styles ל-`.module.css` ותיקנתי imports
- **Result:** האפליקציה נטענת; למדתי את כללי CSS modules של Vite

### דוגמה 2 — Check-in רק במהלך האירוע

- **Situation:** הכפתור הופיע לפני תחילת האירוע; היה צורך בצפייה אחרי האירוע אבל עריכה רק במהלכו
- **Task:** ליישם חלונות זמן נכונים בלקוח ובשרת
- **Action:** בניתי `canViewCheckIn` / `canEditCheckIn` לפי תחילת/סיום האירוע מה-booking + טופס ההפקה; אכפתתי save ב-API עם 403
- **Result:** UX נכון + הגנה בצד השרת

### דוגמה 3 — Prisma generate כשהשרת רץ

- **Situation:** `EPERM` בהרצת `prisma generate`
- **Task:** לעדכן את ה-client אחרי שינוי schema
- **Action:** עצרתי את תהליך Node שנעל את ה-DLL, הרצתי generate, הפעלתי מחדש את השרת
- **Result:** Schema מסונכרן; הבנתי file locking ב-Windows

---

## 9. שאלות נפוצות בראיון — תשובות מוכנות

**ש: למה TypeScript?**

> "דומיין גדול עם הרבה entities וחוזי API. TypeScript תופס שגיאות מוקדם ועושה refactoring בטוח יותר בין client ל-server."

**ש: למה Prisma ולא raw SQL?**

> "שאילתות type-safe, relations ברורים, ו-migrations כשה-schema מתפתח — למשל הוספת EventCheckIn או minimumGuestCount."

**ש: איך עובד האימות?**

> "המנהל מתחבר עם Google. השרת מאמת את ה-ID token, בודק את האימייל מול רשימת מורשים בבסיס הנתונים, ואז מנפיק JWT ל-routes מוגנים."

**ש: איך מייצרים PDF?**

> "השרת בונה HTML מנתוני ההזמנה, מרנדר עם Puppeteer, ומחזיר PDF buffer להורדה או אימייל."

**ש: איך מיושם real-time?**

> "Socket.io — כשהנתונים משתנים בשרת, clients מחוברים מרעננים את state של לוח השנה בלי reload מלא של הדף."

**ש: איך טיפלת ב-validation?**

> "Zod schemas בשכבת ה-API plus בדיקות בצד הלקוח לפני submit — במיוחד לחתימה חובה ב-check-in."

**ש: פרסת את זה?**

> *(ענה/י בכנות)*  
> "פיתחתי ובדקתי locally / [הוסף/י אם נכון: מחובר ל-PostgreSQL בענן]. הארכיטקטורה production-ready: config מבוסס env, middleware אבטחה, client ו-server מופרדים."

**ש: מה היית משפר/ה בהמשך?**

> "בדיקות אוטומטיות (API + flows קריטיים), CI/CD pipeline, E2E tests חזקים יותר להזמנה ו-check-in, ו-role-based permissions אם צריך רמות צוות שונות."

---

## 10. מה לא להגזים

| תגיד/י | תימנע/י |
|-----|--------|
| "פרויקט full-stack TypeScript עם לוגיקת דומיין אמיתית" | "אני expert בכל מה שרשום" |
| "בניתי פיצ'רים end-to-end עם פיתוח מסייע AI" (אם נכון) | "כתבתי כל שורה מאפס בלי עזרה" |
| "סביבת dev; מוכן ל-production hardening" | "כבר משרת אלפי משתמשים" (אלא אם זה נכון) |

---

## 11. משפט סיום

> "הפרויקט הזה מראה שאני יכול/ה לקחת בעיה עסקית אמיתית, לייצג אותה במודל relational בבסיס הנתונים, לבנות frontend React שמיש, לאבטח REST APIs, ולמסור פיצ'רים כמו PDF, OAuth ו-workflows מבוססי זמן — שמתאים היטב לעבודת CRUD ב-production וכלים פנימיים."

---

## 12. רשימת bullets בעמוד אחד (להדפסה)

**פרויקט:** ניהול אולם אירועים — לוח שנה, הזמנות, חוזים, הפקה, check-in חי

**Stack:** React · TypeScript · Vite · Node · Express · Prisma · PostgreSQL · Socket.io · Puppeteer · JWT · Google OAuth · Zod

**ארכיטקטורה:** SPA + REST API + relational DB

**Highlights:** חוזים דיגיטליים ו-PDF · טופס אולם חי עם חתימות · OCR לצ'קים · לוח שנה בזמן אמת · Auth ו-rate limiting

**התרומה שלי:** פיצ'רים full-stack מ-UI → API → DB → PDF

**אתגר שפתרתי:** לוגיקת check-in מבוססת זמן + שכבת API/DB type-safe

---

## 13. Mock Q&A — תרגל/י בקול

**מראיין/ת:** "ספר/י לי על הפרויקט שלך."

**את/ה:** השתמש/י ב-pitch של 2 דקות מסעיף 2.

---

**מראיין/ת:** "מה היה החלק הכי קשה?"

**את/ה:** "ליישם גישה מבוססת זמן לטופס check-in באולם — להציג אותו רק אחרי שהאירוע מתחיל, לאפשר עריכה רק במהלך האירוע, ולאכוף את זה גם ב-React UI וגם ב-Express API כדי שלא ניתן לעקוף."

---

**מראיין/ת:** "איך בנית את ה-backend?"

**את/ה:** "Express עם route modules לפי דומיין — bookings, calendar, event forms, check-in, auth. Controllers מטפלים בלוגיקה, Prisma בגישה לנתונים, Zod ב-validation של input, ו-middleware ב-auth ושגיאות."

---

**מראיין/ת:** "למה כדאי לנו לגייס אותך על בסיס הפרויקט הזה?"

**את/ה:** "זה מוכיח שאני יכול/ה להחזיק בפיצ'ר מ-schema של בסיס הנתונים ועד ממשק משתמש, להבין כללי עסק, ולספק משהו שאולם אמיתי באמת יכול להשתמש בו — לא רק אפליקציית tutorial."

---

*בהצלחה בראיון!*
