import { Request, Response } from 'express';
import prisma from '../config/prisma';
import {
  buildFeedbackSides,
  computeCombinedAverage,
  contactForSide,
  ensureFeedbackRecordsForBooking,
  getClientFeedbackUrl,
  hasEventEnded,
  isLocalClientUrl,
  sendFeedbackLinkForRecord,
} from '../utils/feedbackHelpers';
import { sendManagerFinancialAlertEmail } from '../utils/mailer';
import { paginationMeta, parsePagination } from '../utils/pagination';
import { logger } from '../utils/logger';
import { emitFeedbackUpdated } from '../utils/realtime';

type AdminSide = {
  id: string | null;
  token: string | null;
  link: string | null;
  clientSide: string;
  clientName: string | null;
  foodRating: number | null;
  serviceRating: number | null;
  venueRating: number | null;
  averageScore: number | null;
  comments: string | null;
  isCompleted: boolean;
  createdAt: string | null;
  lastNotifiedAt: string | null;
  lastEmailSent: boolean;
  lastWhatsappSent: boolean;
};

type AdminGroup = {
  bookingId: string;
  eventCode: string;
  eventType: string;
  eventDate: string | null;
  clientAFullName: string;
  clientBFullName: string | null;
  sides: AdminSide[];
  combinedAverage: number | null;
  allCompleted: boolean;
  feedbackStatus: 'not_sent' | 'pending' | 'completed';
};

function buildAdminGroup(
  booking: {
    id: string;
    eventCode: string;
    eventType: string;
    clientAFullName: string;
    clientBFullName: string | null;
    clientAPhone: string;
    clientAEmail?: string | null;
    clientBPhone?: string | null;
    clientBEmail?: string | null;
    eventDate: { date: Date } | null;
  },
  feedbacks: Array<{
    id: string;
    token: string;
    clientSide: string;
    clientName: string | null;
    foodRating: number | null;
    serviceRating: number | null;
    venueRating: number | null;
    averageScore: number | null;
    comments: string | null;
    isCompleted: boolean;
    createdAt: Date;
    lastNotifiedAt?: Date | null;
    lastEmailSent?: boolean;
    lastWhatsappSent?: boolean;
  }>,
): AdminGroup {
  let sides: AdminSide[];

  if (feedbacks.length > 0) {
    sides = feedbacks.map((fb) => ({
      id: fb.id,
      token: fb.token,
      link: getClientFeedbackUrl(fb.token),
      clientSide: fb.clientSide,
      clientName: fb.clientName,
      foodRating: fb.foodRating,
      serviceRating: fb.serviceRating,
      venueRating: fb.venueRating,
      averageScore: fb.averageScore,
      comments: fb.comments,
      isCompleted: fb.isCompleted,
      createdAt: fb.createdAt.toISOString(),
      lastNotifiedAt: fb.lastNotifiedAt?.toISOString() ?? null,
      lastEmailSent: fb.lastEmailSent ?? false,
      lastWhatsappSent: fb.lastWhatsappSent ?? false,
    }));
  } else {
    sides = buildFeedbackSides(booking).map((side) => ({
      id: null,
      token: null,
      link: null,
      clientSide: side.side,
      clientName: side.name,
      foodRating: null,
      serviceRating: null,
      venueRating: null,
      averageScore: null,
      comments: null,
      isCompleted: false,
      createdAt: null,
      lastNotifiedAt: null,
      lastEmailSent: false,
      lastWhatsappSent: false,
    }));
  }

  const completedSides = sides.filter((s) => s.isCompleted);
  const combinedAverage = computeCombinedAverage(completedSides.map((s) => s.averageScore));
  const allCompleted = sides.length > 0 && sides.every((s) => s.isCompleted);

  let feedbackStatus: AdminGroup['feedbackStatus'] = 'not_sent';
  if (feedbacks.length > 0) {
    feedbackStatus = allCompleted ? 'completed' : 'pending';
  }

  return {
    bookingId: booking.id,
    eventCode: booking.eventCode,
    eventType: booking.eventType,
    eventDate: booking.eventDate?.date
      ? new Date(booking.eventDate.date).toISOString().split('T')[0]
      : null,
    clientAFullName: booking.clientAFullName,
    clientBFullName: booking.clientBFullName,
    sides,
    combinedAverage,
    allCompleted,
    feedbackStatus,
  };
}

export const feedbackController = {
  async verifyToken(req: Request, res: Response) {
    try {
      const token = req.params.token as string;

      const feedback = await prisma.feedback.findUnique({
        where: { token },
      });

      if (!feedback) {
        return res.status(404).json({ success: false, message: 'הקישור אינו חוקי או שפג תוקפו.' });
      }

      if (feedback.isCompleted) {
        return res.status(400).json({ success: false, message: 'תודה! המשוב עבור אירוע זה כבר התקבל.' });
      }

      res.status(200).json({
        success: true,
        clientName: feedback.clientName,
        clientSide: feedback.clientSide,
      });
    } catch (error) {
      console.error('Error verifying feedback token:', error);
      res.status(500).json({ success: false, message: 'שגיאת שרת בבדיקת הקישור.' });
    }
  },

  async submitFeedback(req: Request, res: Response) {
    try {
      const token = req.params.token as string;
      const { foodRating, serviceRating, venueRating, comments } = req.body;

      const existingFeedback = await prisma.feedback.findUnique({
        where: { token },
        include: { booking: true },
      });

      if (!existingFeedback || existingFeedback.isCompleted) {
        return res.status(400).json({ success: false, message: 'לא ניתן לשמור את המשוב.' });
      }

      const scores = [foodRating, serviceRating, venueRating].filter((val) => typeof val === 'number');
      let averageScore: number | null = null;

      if (scores.length > 0) {
        averageScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
      }

      const updatedFeedback = await prisma.feedback.update({
        where: { token },
        data: {
          foodRating,
          serviceRating,
          venueRating,
          comments,
          averageScore,
          isCompleted: true,
        },
      });

      const siblingFeedbacks = await prisma.feedback.findMany({
        where: { bookingId: existingFeedback.bookingId },
      });
      const combinedAverage = computeCombinedAverage(
        siblingFeedbacks.map((fb) => (fb.id === updatedFeedback.id ? averageScore : fb.averageScore)),
      );

      if (averageScore && averageScore <= 3) {
        console.warn(
          `[⚠️ התראת שירות] משוב נמוך (${averageScore}) מ-${updatedFeedback.clientName} | ממוצע משולב: ${combinedAverage ?? '—'}`,
        );
        const managerEmail = process.env.MANAGER_EMAIL;
        if (managerEmail) {
          await sendManagerFinancialAlertEmail(
            managerEmail,
            'משוב נמוך מאירוע',
            updatedFeedback.clientName || 'לקוח',
            `צד ${updatedFeedback.clientSide}, ממוצע ${averageScore}. ממוצע משולב לאירוע: ${combinedAverage ?? 'טרם הושלם'}`,
          );
        }
      }

      emitFeedbackUpdated({ bookingId: existingFeedback.bookingId });

      res.status(200).json({
        success: true,
        message: 'המשוב נשמר בהצלחה!',
        combinedAverage,
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      res.status(500).json({ success: false, message: 'שגיאת שרת בשמירת המשוב.' });
    }
  },

  /** יצירת משובים ו/או שליחת קישורים ידנית */
  async sendAdmin(req: Request, res: Response) {
    try {
      const { bookingId, clientSide, sendNotifications = true } = req.body as {
        bookingId: string;
        clientSide?: 'A' | 'B';
        sendNotifications?: boolean;
      };

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { eventDate: true },
      });

      if (!booking) {
        return res.status(404).json({ success: false, message: 'ההזמנה לא נמצאה.' });
      }

      if (booking.isOption) {
        return res.status(400).json({ success: false, message: 'לא ניתן לשלוח משוב לאופציה — רק לאירוע סגור.' });
      }

      if (booking.eventDate?.status !== 'BOOKED') {
        return res.status(400).json({ success: false, message: 'האירוע אינו בסטטוס סגור (BOOKED).' });
      }

      const records = await ensureFeedbackRecordsForBooking(booking);
      if (records.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'לא נמצאו פרטי קשר (מייל/טלפון) לשליחת משוב.',
        });
      }

      let targets = records;
      if (clientSide) {
        targets = records.filter((r) => r.clientSide === clientSide);
      } else {
        targets = records.filter((r) => !r.isCompleted);
      }

      if (targets.length === 0) {
        return res.status(400).json({
          success: false,
          message: clientSide ? 'לא נמצא צד מתאים לשליחה.' : 'כל המשובים כבר מולאו.',
        });
      }

      const results = [];
      for (const record of targets) {
        const contact = contactForSide(booking, record.clientSide);
        if (sendNotifications) {
          results.push(await sendFeedbackLinkForRecord(record, contact));
        } else {
          results.push({
            clientSide: record.clientSide,
            clientName: record.clientName,
            token: record.token,
            link: getClientFeedbackUrl(record.token),
            emailSent: false,
            whatsappSent: false,
            skippedReasons: [],
          });
        }
      }

      const anySent = results.some((r) => r.emailSent || r.whatsappSent);
      const allSkipped = sendNotifications && results.every((r) => !r.emailSent && !r.whatsappSent);
      const localhostLinkWarning = isLocalClientUrl()
        ? 'הקישור במייל מצביע ל-localhost — לקוחות חיצוניים לא יוכלו לפתוח אותו. הגדר CLIENT_URL לכתובת ציבורית (ראה .env).'
        : null;

      emitFeedbackUpdated({ bookingId });

      res.status(200).json({
        success: true,
        message: sendNotifications
          ? (anySent
            ? 'קישורי המשוב נשלחו.'
            : 'לא נשלח — ראה פירוט בשדות skippedReasons.')
          : 'קישורי המשוב נוצרו.',
        results,
        emailSent: results.some((r) => r.emailSent),
        whatsappSent: results.some((r) => r.whatsappSent),
        skippedReasons: [
          ...new Set([
            ...results.flatMap((r) => r.skippedReasons),
            ...(localhostLinkWarning ? [localhostLinkWarning] : []),
          ]),
        ],
        ...(allSkipped && !anySent ? { warning: true } : {}),
        ...(localhostLinkWarning ? { warning: true } : {}),
      });
    } catch (error) {
      logger.error('Error sending feedback admin', { error });
      res.status(500).json({ success: false, message: 'שגיאה בשליחת משוב.' });
    }
  },

  /** רשימת משובים למנהל — כולל אירועים שהסתיימו ללא משוב */
  async listAdmin(req: Request, res: Response) {
    try {
      const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
      const now = new Date();

      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      const candidates = await prisma.booking.findMany({
        where: {
          isOption: false,
          eventDate: {
            status: 'BOOKED',
            date: { lte: endOfToday },
          },
        },
        include: {
          eventDate: true,
          eventForm: { select: { eventTime: true } },
          feedbacks: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { eventDate: { date: 'desc' } },
      });

      const finishedBookings = candidates.filter(
        (booking) => booking.eventDate && hasEventEnded(booking, booking.eventDate.date, booking.eventForm, now),
      );

      const data = finishedBookings.map((booking) => buildAdminGroup(booking, booking.feedbacks));
      const total = data.length;
      const pageData = data.slice(skip, skip + limit);

      res.status(200).json({
        success: true,
        data: pageData,
        pagination: paginationMeta(page, limit, total),
      });
    } catch (error) {
      logger.error('Error listing feedback', { error });
      res.status(500).json({ success: false, message: 'שגיאה בטעינת המשובים.' });
    }
  },
};
