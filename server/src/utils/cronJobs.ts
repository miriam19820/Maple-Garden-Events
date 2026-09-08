import { getBrandConfig } from '@maple/shared/brand';
const brand = getBrandConfig();
import cron from 'node-cron';
import prisma from '../config/prisma';
import { logger } from './logger';
import {
  sendSelectionReminderWhatsApp,
  sendSecurityCheckReminderWhatsApp,
  sendManagerFinancialAlert,
} from './whatsapp';
import {
  sendSelectionReminderEmail,
  sendSecurityCheckReminderEmail,
  sendManagerFinancialAlertEmail,
} from './mailer';
import { processDueFeedback } from './feedbackHelpers';
import { FEEDBACK_LOOKBACK_DAYS, FEEDBACK_SEND_HOUR } from './feedbackSchedule';
import { runDatabaseBackup } from './databaseBackup';
import { processDueScheduledGreetings } from '../Services/greetingService';
import { checkOverduePayments } from '../Services/paymentDeadlineService';
import { computeHallBalanceBreakdown } from '../Services/easyCount/hallBalance';
import { processPreviousDayFinancialSummaries } from '../Services/eventFinancialSummary.service';
import { DEFAULT_LOCALE, getServerTranslation, T } from '../i18n/getServerTranslation';
import { reportBackgroundFailure } from '../Services/criticalAlert.service';
import { runDailyEventArchive } from '../Services/eventArchive.service';
import { startWhatsAppCronJobs } from './whatsappCronJobs';

export const startCronJobs = () => {
  logger.info('Cron jobs service started');

  // WhatsApp outbox / webhook / automation workers (§26). No-ops while
  // WHATSAPP_ENABLED is false, so this is safe to register unconditionally.
  startWhatsAppCronJobs();

  if (process.env.BACKUP_ENABLED === 'true') {
    const schedule = process.env.BACKUP_CRON || '0 3 * * *';
    cron.schedule(schedule, async () => {
      logger.info('Starting scheduled database backup');
      try {
        await runDatabaseBackup();
      } catch (error) {
        reportBackgroundFailure('database-backup', error);
      }
    });
    logger.info(`Database backup scheduled: ${schedule}`);
  }
  
  // הגדרות למנהל
  const MANAGER_PHONE = process.env.MANAGER_PHONE || '0501234567';
  const MANAGER_EMAIL = process.env.MANAGER_EMAIL || brand.messaging.managerAlertEmail; 

  // ==========================================
  // אופציות שפג תוקפן — נשארות על הלוח עד סגירת אירוע אמיתי (BOOKED)
  // שחרור ידני: POST /api/bookings/release
  // ==========================================

  // ==========================================
  // ארכיון יומי: סטטוס Archived לאירועי אתמול + מחיקה אחרי 7 שנים (00:00)
  // ==========================================
  const archiveSchedule = process.env.ARCHIVE_CRON || '0 0 * * *';
  cron.schedule(archiveSchedule, async () => {
    logger.info('--- מתחיל ארכיון יומי של אירועים ---');
    try {
      const result = await runDailyEventArchive();
      logger.info('✅ ארכיון יומי הסתיים', result);
    } catch (error) {
      logger.error('שגיאה בארכיון יומי של אירועים:', error);
      reportBackgroundFailure('event-archive', error);
    }
  });
  logger.info(`Event archive scheduled: ${archiveSchedule}`);

  // ==========================================
  // טיימר 2: התראות "נודניק" חכמות (כל בוקר ב-09:00)
  // ==========================================
  cron.schedule('0 9 * * *', async () => {
    logger.info('--- מתחיל סריקת בוקר להתראות "נודניק" לאירועים סגורים ---');
    const { t } = getServerTranslation(DEFAULT_LOCALE);
    const now = new Date();
    const todayDayOfWeek = now.getDay(); // 0 = יום ראשון, 1 = שני...

    try {
      const activeBookings = await prisma.booking.findMany({
        where: { eventDate: { status: 'BOOKED' } },
        include: { eventDate: true, eventForm: true, hallInvoices: true },
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
          
          const details = t(T.SERVER.CRON.SECURITY_CHECK_DETAILS, {
            date: booking.createdAt.toLocaleDateString('he-IL'),
          });
          const alertType = t(T.SERVER.CRON.ALERTS.MISSING_SECURITY_CHECK);
          await sendManagerFinancialAlert(MANAGER_PHONE, alertType, clientName, details);
          await sendManagerFinancialAlertEmail(MANAGER_EMAIL, alertType, clientName, details);
        }

        // ---------------------------------------------------------
        // 2. כספים: תשלום סופי חסר (פחות מ-30 יום לאירוע — C5: כולל pending)
        // ---------------------------------------------------------
        const hallBalance = computeHallBalanceBreakdown(booking, booking.hallInvoices);
        const amountDue = hallBalance.remaining;
        if (daysUntilEvent <= 30 && daysUntilEvent > 0 && amountDue > 0) {
          const pendingNote =
            hallBalance.pendingTotal > 0
              ? t(T.SERVER.CRON.PENDING_NOTE, {
                  amount: hallBalance.pendingTotal.toLocaleString('he-IL'),
                })
              : '';
          const details = t(T.SERVER.CRON.OPEN_BALANCE_DETAILS, {
            eventDate: booking.eventDate!.date.toLocaleDateString('he-IL'),
            amount: amountDue.toLocaleString('he-IL'),
            pendingNote,
          });
          const alertType = t(T.SERVER.CRON.ALERTS.OPEN_BALANCE);
          await sendManagerFinancialAlert(MANAGER_PHONE, alertType, clientName, details);
          await sendManagerFinancialAlertEmail(MANAGER_EMAIL, alertType, clientName, details);
        }

        // ---------------------------------------------------------
        // 3. תפעול: אי השלמת טופס ופרטים לאירוע
        // ---------------------------------------------------------
        // אם אנחנו בטווח של חודש מהאירוע
        if (daysUntilEvent <= 30 && daysUntilEvent > 0) {
          const missingItems: string[] = [];
          const f = booking.eventForm;
          
          if (!f) {
            missingItems.push(
              t(T.SERVER.CRON.MISSING_ITEMS.TABLE_DESIGN),
              t(T.SERVER.CRON.MISSING_ITEMS.MENU),
              t(T.SERVER.CRON.MISSING_ITEMS.GUEST_COUNT),
            );
          } else {
            if (!f.tableclothId || !f.napkinId) {
              missingItems.push(t(T.SERVER.CRON.MISSING_ITEMS.TABLECLOTH));
            }
            if (!f.finalGuestCount) {
              missingItems.push(t(T.SERVER.CRON.MISSING_ITEMS.FINAL_GUESTS));
            }
            if (!f.kashrut) {
              missingItems.push(t(T.SERVER.CRON.MISSING_ITEMS.KASHRUT));
            }
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

      logger.info('✅ סריקת בוקר (נודניק כפול וחכם) הסתיימה בהצלחה.');

    } catch (error) {
      logger.error('שגיאה בהרצת התראות נודניק:', error);
      reportBackgroundFailure('nudnik-reminders', error);
    }
  });

  // ==========================================
  // טיימר 3: משוב לאחר אירוע — סריקה תקופתית (ברירת מחדל: כל שעה עגולה)
  // ==========================================
  // A single idempotent sweep replaces the previous pair of jobs. It dispatches
  // every event whose survey is due (event day + 1 at FEEDBACK_SEND_HOUR), retries
  // failed deliveries with backoff and catches up after downtime — all driven by
  // the event's real end datetime, never by EventDate.status, so it cannot race
  // with the nightly archive job. Running it repeatedly is safe: every recipient
  // is claimed atomically in the database before anything is sent.
  const feedbackSchedule = process.env.FEEDBACK_CRON || '0 * * * *';
  cron.schedule(feedbackSchedule, async () => {
    try {
      const result = await processDueFeedback();
      if (result.eventsProcessed > 0 || result.linksSent > 0 || result.failedEvents > 0) {
        logger.info(
          `--- משוב אוטומטי: ${result.linksSent} קישורים נשלחו `
            + `(${result.eventsProcessed} אירועים, ${result.checked} נבדקו, `
            + `${result.failedEvents} כשלים, ${result.tenants} טננטים) ---`,
        );
      }
    } catch (error) {
      logger.error('שגיאה בתהליך שליחת משוב אוטומטי:', error);
      reportBackgroundFailure('due-feedback-sweep', error);
    }
  });
  logger.info(
    `Post-event feedback sweep scheduled: ${feedbackSchedule} (send hour ${FEEDBACK_SEND_HOUR}:00, `
      + `lookback ${FEEDBACK_LOOKBACK_DAYS}d, timezone ${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
  );

  // ==========================================
  // טיימר 3ג: סיכום כספי למנהל — בוקר אחרי האירוע (09:15)
  // ==========================================
  cron.schedule('15 9 * * *', async () => {
    logger.info('--- שולח סיכומים כספיים לאירועי אתמול ---');
    try {
      const { checked, sent, date } = await processPreviousDayFinancialSummaries();
      logger.info(`✅ סיכום כספי (${date}): נשלחו ${sent}/${checked}`);
    } catch (error) {
      logger.error('שגיאה בסיכום כספי לאירועי אתמול:', error);
      reportBackgroundFailure('previous-day-financial-summary', error);
    }
  });

  // ==========================================
  // ברכות מתוזמנות — בדיקה כל דקה
  // ==========================================
  cron.schedule('* * * * *', async () => {
    try {
      const processed = await processDueScheduledGreetings();
      if (processed > 0) {
        logger.info(`[GREETING] טיפל ב-${processed} ברכות מתוזמנות`);
      }
    } catch (error) {
      logger.error('שגיאה בעיבוד ברכות מתוזמנות:', error);
      reportBackgroundFailure('scheduled-greetings', error);
    }
  });

  // ==========================================
  // טיימר 5: מעקב מועדי תשלום + תזכורות (כל בוקר ב-08:00)
  // ==========================================
  cron.schedule('0 8 * * *', async () => {
    logger.info('--- מתחיל סריקת איחורי תשלום (C5 / Easy Count) ---');
    try {
      const summary = await checkOverduePayments();
      logger.info('✅ סריקת מועדי תשלום הסתיימה', summary);
    } catch (error) {
      logger.error('שגיאה בסריקת מועדי תשלום:', error);
      reportBackgroundFailure('overdue-payments', error);
    }
  });

  // ==========================================
  // טיימר 4: התראת תוקף תעודות כשרות (רץ כל בוקר ב-08:00)
  // ==========================================
  cron.schedule('0 8 * * *', async () => {
    logger.info('--- בודק תוקף תעודות כשרות ---');
    const { t } = getServerTranslation(DEFAULT_LOCALE);
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
        const statusText = isExpired
          ? t(T.SERVER.CRON.KASHRUT_EXPIRED)
          : t(T.SERVER.CRON.KASHRUT_EXPIRING);
        const dateStr = cert.validUntil
          ? cert.validUntil.toLocaleDateString('he-IL')
          : t(T.SERVER.CRON.KASHRUT_UNKNOWN_DATE);

        const details = t(T.SERVER.CRON.KASHRUT_DETAILS, {
          name: cert.displayName,
          status: statusText,
          date: dateStr,
        });
        const alertType = t(T.SERVER.CRON.ALERTS.KASHRUT_EXPIRY);

        await sendManagerFinancialAlert(MANAGER_PHONE, alertType, cert.displayName, details);
        await sendManagerFinancialAlertEmail(MANAGER_EMAIL, alertType, cert.displayName, details);
        
        logger.info(`✅ נשלחה התראת כשרות למנהל עבור: ${cert.displayName}`);
      }
    } catch (error) {
      logger.error('שגיאה בסריקת תעודות כשרות:', error);
      reportBackgroundFailure('kashrut-expiry', error);
    }
  });

};