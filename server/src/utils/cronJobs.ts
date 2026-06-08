import cron from 'node-cron';
import prisma from '../config/prisma';
import { v4 as uuidv4 } from 'uuid'; // הוספנו ליצירת האסימונים הייחודיים
import { 
  sendSelectionReminderWhatsApp, 
  sendSecurityCheckReminderWhatsApp, 
  sendManagerFinancialAlert,
  sendFeedbackRequestWhatsApp // <-- ייבוא פונקציית הוואטסאפ החדשה
} from './whatsapp';
import {
  sendSelectionReminderEmail,
  sendSecurityCheckReminderEmail,
  sendManagerFinancialAlertEmail,
  sendFeedbackRequestEmail // <-- ייבוא פונקציית המייל החדשה
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
            const isCriticalPeriod = daysUntilEvent <= 10; // שבוע וחצי (10 ימים) ומטה
            const isWeeklyReminderDay = (todayDayOfWeek === 0); // יום ראשון

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

  // ==========================================
  // טיימר 3: בקשת משוב לאחר אירוע (רץ כל בוקר ב-10:00)
  // ==========================================
  cron.schedule('0 10 * * *', async () => {
    console.log('--- מתחיל תהליך איתור אירועים מאתמול לשליחת משוב ---');
    
    // הגדרת טווח הזמנים של "אתמול"
    const now = new Date();
    const startOfYesterday = new Date(now);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);

    const endOfYesterday = new Date(now);
    endOfYesterday.setDate(endOfYesterday.getDate() - 1);
    endOfYesterday.setHours(23, 59, 59, 999);

    try {
      // שליפת הזמנות של אירועים שהיו אתמול ובסטטוס "סגור"
      const finishedBookings = await prisma.booking.findMany({
        where: {
          eventDate: {
            date: {
              gte: startOfYesterday,
              lte: endOfYesterday
            },
            status: 'BOOKED'
          }
        },
        include: {
          feedbacks: true // נביא את הפידבקים כדי לוודא שטרם יצרנו
        }
      });

      if (finishedBookings.length === 0) {
        console.log('לא נמצאו אירועים מאתמול.');
        return;
      }

      for (const booking of finishedBookings) {
        // בודקים אם כבר הופק משוב לאירוע הזה (למנוע כפילויות)
        if (booking.feedbacks && booking.feedbacks.length > 0) {
          continue; 
        }

        const feedbacksToCreate = [];

        // 1. יצירת נתונים לצד א'
        if (booking.clientAPhone) {
          feedbacksToCreate.push({
            bookingId: booking.id,
            clientSide: 'A',
            clientName: booking.clientAFullName,
            token: uuidv4(),
          });
        }

        // 2. יצירת נתונים לצד ב' (אם קיים)
        if (booking.clientBFullName && booking.clientBPhone) {
          feedbacksToCreate.push({
            bookingId: booking.id,
            clientSide: 'B',
            clientName: booking.clientBFullName,
            token: uuidv4(),
          });
        }

        // אם יש לנו צדדים רלוונטיים, נשמור במסד ונייצר להם קישור
        if (feedbacksToCreate.length > 0) {
          await prisma.feedback.createMany({
            data: feedbacksToCreate
          });

          for (const fb of feedbacksToCreate) {
            // הקישור למערכת הלקוח
            const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
            const feedbackLink = `${baseUrl}/feedback/${fb.token}`;
            
            // שולפים את הטלפון והמייל הרלוונטיים לפי צד הלקוח
            let phoneToSend = null;
            let emailToSend = null;

            if (fb.clientSide === 'A') {
              phoneToSend = booking.clientAPhone?.split(' | ')[0].trim() || null;
              emailToSend = booking.clientAEmail || null;
            } else {
              phoneToSend = booking.clientBPhone?.split(' | ')[0].trim() || null;
              emailToSend = booking.clientBEmail || null;
            }
            
            // שליחה ל-WhatsApp אם יש מספר
            if (phoneToSend) {
              await sendFeedbackRequestWhatsApp(phoneToSend, fb.clientName, feedbackLink);
              console.log(`✅ נשלח וואטסאפ משוב ללקוח ${fb.clientName} (צד ${fb.clientSide})`);
            }

            // שליחה למייל אם יש כתובת
            if (emailToSend) {
              await sendFeedbackRequestEmail(emailToSend, fb.clientName, feedbackLink);
              console.log(`✅ נשלח מייל משוב ללקוח ${fb.clientName} (צד ${fb.clientSide})`);
            }
          }
        }
      }

      console.log('✅ תהליך שליחת משובים הסתיים בהצלחה.');

    } catch (error) {
      console.error('שגיאה בתהליך שליחת המשובים:', error);
    }
  });

  // ==========================================
  // טיימר 4: התראת תוקף תעודות כשרות (רץ כל בוקר ב-08:00)
  // ==========================================
  cron.schedule('0 8 * * *', async () => {
    console.log('--- בודק תוקף תעודות כשרות ---');
    const now = new Date();
    const warningDate = new Date();
    warningDate.setDate(now.getDate() + 14); // התראה שבועיים מראש

    try {
      const expiringCerts = await prisma.kashrutCertificate.findMany({
        where: { 
          validUntil: { lte: warningDate } 
        }
      });

      for (const cert of expiringCerts) {
        // בודקים אם עבר התוקף או שרק מתקרב
        const isExpired = cert.validUntil && cert.validUntil < now;
        const statusText = isExpired ? 'פג תוקף!' : 'עומד לפוג בקרוב.';
        const dateStr = cert.validUntil ? cert.validUntil.toLocaleDateString('he-IL') : 'לא ידוע';
        
        const details = `תעודת הכשרות של "${cert.displayName}" ${statusText} (תאריך פקיעה: ${dateStr}). נא להיכנס למערכת, לעדכן תאריך חדש ולהעלות צילום תעודה מעודכן.`;
        
        // שליחת התראה גם למייל וגם לוואטסאפ של המנהל
        await sendManagerFinancialAlert(MANAGER_PHONE, "תוקף תעודת כשרות", cert.displayName, details);
        await sendManagerFinancialAlertEmail(MANAGER_EMAIL, "תוקף תעודת כשרות", cert.displayName, details);
        
        console.log(`✅ נשלחה התראת כשרות למנהל עבור: ${cert.displayName}`);
      }
    } catch (error) {
      console.error('שגיאה בסריקת תעודות כשרות:', error);
    }
  });

};