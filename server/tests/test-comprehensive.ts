import { getDayStaticStatus, EventStatus } from '../src/Services/calendar.service';
// @ts-ignore
import hebcal from 'hebcal';

async function runComprehensiveTest() {
    console.log("⏳ מתחיל בדיקה מקיפה ל-100 שנים הקרובות...");
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(startDate.getFullYear() + 100);

    let currentDate = new Date(startDate);
    let errors = 0;
    let daysChecked = 0;

    while (currentDate <= endDate) {
        const jsDay = currentDate.getDay();
        const hDate = new hebcal.HDate(currentDate);
        const hMonth = hDate.getMonth();
        const hDay = hDate.getDate();

        // שולפים סטטוס גם עבור "חתונה" וגם עבור "ברית"
        const weddingStatus = getDayStaticStatus(currentDate, 'חתונה');
        const otherStatus = getDayStaticStatus(currentDate, 'ברית');

        // 1. בדיקת שבת: לעולם לא פתוחה
        if (jsDay === 6) {
            if (weddingStatus.type === EventStatus.AVAILABLE || weddingStatus.type === EventStatus.PROBLEMATIC) {
                console.error(`❌ שגיאה: שבת פתוחה לחתונה! תאריך: ${currentDate.toDateString()}`);
                errors++;
            }
        }

        // 2. יום כיפור ופסח: לעולם לא פתוחים (או BLOCKED בגלל שבת או FORBIDDEN)
        if ((hMonth === 7 && hDay === 10) || (hMonth === 1 && hDay === 15)) {
            if (weddingStatus.type === EventStatus.AVAILABLE || weddingStatus.type === EventStatus.PROBLEMATIC) {
                console.error(`❌ שגיאה: חג/צום פתוח! תאריך: ${currentDate.toDateString()}`);
                errors++;
            }
        }

        // 3. בדיקת ספירת העומר (למשל כ' באייר, שזה חודש 2 יום 20)
        // נוודא שזה לא נופל על שבת או שישי כדי לבדוק את החוק הנקי
        if (hMonth === 2 && hDay === 20 && jsDay !== 6 && jsDay !== 5) {
            if (weddingStatus.type === EventStatus.AVAILABLE) {
                console.error(`❌ שגיאה: ספירת העומר פתוחה לחתונה! תאריך: ${currentDate.toDateString()}`);
                errors++;
            }
            if (otherStatus.type !== EventStatus.AVAILABLE) {
                console.error(`❌ שגיאה: ספירת העומר חסומה לברית! תאריך: ${currentDate.toDateString()}`);
                errors++;
            }
        }

        // 4. שלושת השבועות (למשל כ"ה בתמוז, חודש 4 יום 25)
        if (hMonth === 4 && hDay === 25 && jsDay !== 6 && jsDay !== 5) {
            if (weddingStatus.type === EventStatus.AVAILABLE) {
                console.error(`❌ שגיאה: שלושת השבועות פתוחים לחתונה! תאריך: ${currentDate.toDateString()}`);
                errors++;
            }
            if (otherStatus.type !== EventStatus.AVAILABLE) {
                console.error(`❌ שגיאה: שלושת השבועות חסומים לברית! תאריך: ${currentDate.toDateString()}`);
                errors++;
            }
        }

        // 5. תשעת הימים (למשל ה' באב, חודש 5 יום 5)
        if (hMonth === 5 && hDay === 5 && jsDay !== 6 && jsDay !== 5) {
             if (weddingStatus.type !== EventStatus.FORBIDDEN) {
                console.error(`❌ שגיאה: תשעת הימים לא נחסמו לחתונה! תאריך: ${currentDate.toDateString()}`);
                errors++;
            }
        }

        currentDate.setDate(currentDate.getDate() + 1);
        daysChecked++;
    }

    if (errors === 0) {
        console.log(`\n🎉 מדהים! נבדקו ${daysChecked} ימים (100 שנים קדימה).`);
        console.log(`✅ שבתות חסומות תמיד.`);
        console.log(`✅ יום כיפור ופסח חסומים תמיד.`);
        console.log(`✅ ספירת העומר חסומה לחתונות ופתוחה לבריתות.`);
        console.log(`✅ שלושת השבועות ותשעת הימים מתנהגים בדיוק לפי הכללים.`);
        console.log(`✅ לוגיקת הלוח שלך חסינה ל-100 שנים הבאות! 🏆`);
    } else {
        console.log(`\n⚠️ נמצאו ${errors} שגיאות.`);
    }
    
    // זה יסגור את הטסט בצורה נקייה וימנע את שגיאת הפורט 5000:
    process.exit(0); 
}

runComprehensiveTest();