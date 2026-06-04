import cron from 'node-cron';
import prisma from '../config/prisma';
import { 
  sendSelectionReminderWhatsApp, 
  sendSecurityCheckReminderWhatsApp, 
  sendManagerFinancialAlert 
} from './whatsapp';
import {
  sendSelectionReminderEmail,
  sendSecurityCheckReminderEmail,
  sendManagerFinancialAlertEmail
} from './mailer';

export const startCronJobs = () => {
  console.log('⏳ שירות הטיימרים (Cron Jobs) הופעל בהצלחה.');
  
  // הגדרות למנהל
  const MANAGER_PHONE = '0501234567'; 
  const MANAGER_EMAIL = 'maple.events.il@gmail.com'; 

  // ==========================================
  // טיימר 1: ניקוי אופציות (רץ כל שעה עגולה)
  // ==========================================
  cron.schedule('0 * * * *', async () => {
    const now = new Date();
    try {
      const expiredDates = await prisma.eventDate.findMany({
        where: { status: 'OPTION', optionExpiresAt: { lt: now } }
      });

      if (expiredDates.length > 0) {
        const dateIds = expiredDates.map(d => d.id);
        await prisma.eventDate.updateMany({
          where: { id: { in: dateIds } },
          data: { status: 'AVAILABLE', lockedBy: null, optionExpiresAt: null, clientName: null, clientPhone: null, clientEmail: null }
        });
        await prisma.booking.deleteMany({ where: { calendarDateId: { in: dateIds } } });
        console.log(`✅ נוקו ${expiredDates.length} אופציות שפג תוקפן.`);
      }
    } catch (error) {
      console.error('שגיאה בניקוי אופציות אוטומטי:', error);
    }
  });

  // ==========================================
  // טיימר 2: התראות "נודניק" חכמות (כל בוקר ב-09:00)
  // ==========================================
  cron.schedule('0 9 * * *', async () => {
    console.log('--- מתחיל סריקת בוקר להתראות "נודניק" לאירועים סגורים ---');
    const now = new Date();
    const todayDayOfWeek = now.getDay(); // 0 = יום ראשון, 1 = שני...

    try {
      const activeBookings = await prisma.booking.findMany({
        where: { eventDate: { status: 'BOOKED' } },
        include: { eventDate: true, eventForm: true }
      });

      for (const booking of activeBookings) {
        const clientPhone = booking.clientAPhone?.split(' | ')[0].trim() || null;
        const clientEmail = booking.clientAEmail || null;
        const clientName = booking.clientAFullName;

        // --- חישוב זמן ---
        const msSinceCreation = now.getTime() - booking.createdAt.getTime();
        const hoursSinceCreation = msSinceCreation / (1000 * 60 * 60);
        
        let daysUntilEvent = 999;
        if (booking.eventDate) {
          const msUntilEvent = booking.eventDate.date.getTime() - now.getTime();
          daysUntilEvent = Math.ceil(msUntilEvent / (1000 * 60 * 60 * 24));
        }

        // ---------------------------------------------------------
        // 1. כספים: צ'ק ביטחון חסר (רץ תמיד, כל יום, אחרי 24 שעות!)
        // ---------------------------------------------------------
        if (booking.securityCheckStatus === 'PENDING' && hoursSinceCreation > 24) {
          if (clientPhone) await sendSecurityCheckReminderWhatsApp(clientPhone, clientName);
          if (clientEmail) await sendSecurityCheckReminderEmail(clientEmail, clientName);
          
          const details = `האירוע נסגר בתאריך ${booking.createdAt.toLocaleDateString('he-IL')} וטרם התקבל צ'ק.`;
          await sendManagerFinancialAlert(MANAGER_PHONE, "חסר צ'ק ביטחון", clientName, details);
          await sendManagerFinancialAlertEmail(MANAGER_EMAIL, "חסר צ'ק ביטחון", clientName, details);
        }

        // ---------------------------------------------------------
        // 2. כספים: תשלום סופי חסר (פחות מ-30 יום לאירוע - התראה למנהל כל יום)
        // ---------------------------------------------------------
        const amountDue = booking.totalPrice - (booking.totalPaid || 0);
        if (daysUntilEvent <= 30 && daysUntilEvent > 0 && amountDue > 0) {
          const details = `האירוע מתקיים ב-${booking.eventDate!.date.toLocaleDateString('he-IL')}, נותר לתשלום: ₪${amountDue}`;
          await sendManagerFinancialAlert(MANAGER_PHONE, "חוב פתוח לאירוע קרוב", clientName, details);
          await sendManagerFinancialAlertEmail(MANAGER_EMAIL, "חוב פתוח לאירוע קרוב", clientName, details);
        }

        // ---------------------------------------------------------
        // 3. תפעול: אי השלמת טופס ופרטים לאירוע
        // ---------------------------------------------------------
        // אם אנחנו בטווח של חודש מהאירוע
        if (daysUntilEvent <= 30 && daysUntilEvent > 0) {
          const missingItems: string[] = [];
          const f = booking.eventForm;
          
          if (!f) {
            missingItems.push('עיצוב שולחנות ואולם', 'תפריט קייטרינג', 'שעות ויעד מוזמנים סופי');
          } else {
            if (!f.tableclothId || !f.napkinId) missingItems.push('בחירת צבעי מפות ומפיות');
            if (!f.finalGuestCount) missingItems.push('כמות מוזמנים סופית');
            if (!f.kashrut) missingItems.push('סוג כשרות מבוקשת');
          }

          if (missingItems.length > 0) {
            // הנה הלוגיקה החכמה שלך:
            const isCriticalPeriod = daysUntilEvent <= 10; // שבוע וחצי (10 ימים) ומטה
            const isWeeklyReminderDay = (todayDayOfWeek === 0); // יום ראשון

            // אם אנחנו בתקופה הקריטית (כל יום), או שאנחנו ביום ראשון של השבוע:
            if (isCriticalPeriod || isWeeklyReminderDay) {
              if (clientPhone) await sendSelectionReminderWhatsApp(clientPhone, clientName, missingItems);
              if (clientEmail) await sendSelectionReminderEmail(clientEmail, clientName, missingItems);
            }
          }
        }
      }

      console.log('✅ סריקת בוקר (נודניק כפול וחכם) הסתיימה בהצלחה.');

    } catch (error) {
      console.error('שגיאה בהרצת התראות נודניק:', error);
    }
  });
};