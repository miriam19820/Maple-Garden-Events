import { getDayStaticStatus, EventStatus } from '../src/Services/calendar.service';
// @ts-ignore

import hebcal from 'hebcal';

async function run100YearsTest() {
    console.log("⏳ מתחיל סריקה של לוח השנה ל-100 שנים הקרובות...");
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(startDate.getFullYear() + 100);

    let currentDate = new Date(startDate);
    let errorCount = 0;
    let daysChecked = 0;

    while (currentDate <= endDate) {
        const statusObj = getDayStaticStatus(currentDate, 'חתונה');
        const dayOfWeek = currentDate.getDay();
        const hDate = new hebcal.HDate(currentDate);

        // 1. בדיקת שבת: אם יום שבת והסטטוס לא BLOCKED -> שגיאה
        if (dayOfWeek === 6 && statusObj.type !== EventStatus.BLOCKED) {
            console.error(`❌ שגיאה: שבת לא נחסמה! תאריך: ${currentDate.toDateString()}`);
            errorCount++;
        }

        // 2. בדיקת יום כיפור (י בתשרי): חובה שיהיה FORBIDDEN
        if (hDate.getMonth() === 7 && hDate.getDate() === 10 && statusObj.type !== EventStatus.FORBIDDEN) {
            console.error(`❌ שגיאה: יום כיפור לא נחסם! תאריך: ${currentDate.toDateString()}`);
            errorCount++;
        }

        currentDate.setDate(currentDate.getDate() + 1);
        daysChecked++;
    }

    if (errorCount === 0) {
        console.log(`✅ טסט 100 שנים עבר בהצלחה מושלמת! נבדקו ${daysChecked} ימים. שבתות וחגים חסומים כראוי.`);
    } else {
        console.log(`⚠️ הטסט הסתיים עם ${errorCount} שגיאות. חובה לבדוק את הלוגיקה.`);
    }
}

run100YearsTest();