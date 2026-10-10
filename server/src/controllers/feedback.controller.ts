import { Request, Response } from 'express';
import prisma from '../config/prisma';
import type { AuthRequest } from '../middlewares/auth';
import { FEEDBACK_ELIGIBLE_EVENT_STATUSES } from '../utils/feedbackSchedule';
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
import {
  detectFeedbackDiscrepancy,
  getFeedbackDashboardUrl,
} from '../utils/feedbackAnomaly';
import { sendManagerFinancialAlertEmail } from '../utils/mailer';
import { sendManagerFinancialAlert } from '../utils/whatsapp';
import { getBrandConfig } from '@maple/shared/brand';
import {
  aggregateFeedbackScores,
  avgNumbers,
  computeDeliveryTotals,
  groupByMonth,
  groupByYear,
  percentage,
  type StatsFeedbackRow,
} from '../utils/feedbackStats';
import { paginationMeta, parsePagination } from '../utils/pagination';
import { logger } from '../utils/logger';
import { calendarKeyFromDbDate } from '../utils/dateLocal';
import { emitFeedbackUpdated } from '../utils/realtime';
import {
  DEFAULT_LOCALE,
  getServerTranslation,
  resolveLocaleFromRequest,
  T,
} from '../i18n/getServerTranslation';
import { catchAsync } from '../middlewares/errorHandler';
import { AppError } from '../utils/AppError';
import { NotFoundError } from '../utils/httpErrors';

const FEEDBACK_ALREADY_SUBMITTED_CODE = 'ALREADY_SUBMITTED';

/**
 * Events stay part of the feedback flow after the nightly archive job flips them
 * to ARCHIVED. Filtering on BOOKED alone used to hide every completed event — and
 * every response given to it — from the admin list and from all statistics.
 */
const ELIGIBLE_EVENT_STATUS_FILTER = { status: { in: [...FEEDBACK_ELIGIBLE_EVENT_STATUSES] } };
const MANAGER_PHONE = process.env.MANAGER_PHONE || '0501234567';

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

function buildEventDateRange(year: number, month: number | null): { gte: Date; lt: Date } {
  if (month) {
    return { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
  }
  return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
}

type StatsPeriod = {
  allYears: boolean;
  year: number | null;
  month: number | null;
};

function parseStatsPeriod(query: Record<string, unknown>): StatsPeriod {
  const yearParam = query.year;
  const month = query.month ? Number(query.month) : null;

  if (yearParam === 'all') {
    return { allYears: true, year: null, month };
  }

  return {
    allYears: false,
    year: yearParam ? Number(yearParam) : new Date().getFullYear(),
    month,
  };
}

function eventDateFilter(period: StatsPeriod): { gte: Date; lt: Date } | undefined {
  if (period.allYears) return undefined;
  return buildEventDateRange(period.year!, period.month);
}

function eventMonthMatches(date: Date, month: number | null): boolean {
  if (!month) return true;
  return new Date(date).getMonth() + 1 === month;
}

async function getAvailableFeedbackYears(tenantId: string): Promise<number[]> {
  const feedbacks = await prisma.feedback.findMany({
    where: {
      tenantId,
      isCompleted: true,
      booking: { tenantId, isOption: false, eventDate: ELIGIBLE_EVENT_STATUS_FILTER },
    },
    select: { booking: { select: { eventDate: { select: { date: true } } } } },
  });

  const years = new Set<number>();
  for (const fb of feedbacks) {
    if (fb.booking.eventDate?.date) {
      years.add(new Date(fb.booking.eventDate.date).getFullYear());
    }
  }
  return [...years].sort((a, b) => b - a);
}

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
      ? calendarKeyFromDbDate(new Date(booking.eventDate.date))
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
  verifyToken: catchAsync(async (req: Request, res: Response) => {
    const locale = resolveLocaleFromRequest(req, DEFAULT_LOCALE);
    const { t } = getServerTranslation(locale);
    const token = req.params.token as string;

    const feedback = await prisma.feedback.findUnique({
      where: { token },
    });

    if (!feedback) {
      throw new NotFoundError(t(T.SERVER.ERRORS.FEEDBACK.INVALID_LINK));
    }

    if (feedback.isCompleted) {
      throw new AppError(t(T.SERVER.ERRORS.FEEDBACK.ALREADY_SUBMITTED), {
        statusCode: 409,
        code: FEEDBACK_ALREADY_SUBMITTED_CODE,
      });
    }

    res.status(200).json({
      success: true,
      clientName: feedback.clientName,
      clientSide: feedback.clientSide,
    });
  }),

  submitFeedback: catchAsync(async (req: Request, res: Response) => {
    const locale = resolveLocaleFromRequest(req, DEFAULT_LOCALE);
    const { t } = getServerTranslation(locale);
    const token = req.params.token as string;
    const { foodRating, serviceRating, venueRating, comments } = req.body;

    const scores = [foodRating, serviceRating, venueRating].filter(
      (val): val is number => typeof val === 'number',
    );
    const averageScore =
      scores.length > 0
        ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
        : null;

    const txResult = await prisma.$transaction(async (tx) => {
      const existing = await tx.feedback.findUnique({
        where: { token },
        include: { booking: true },
      });

      if (!existing) {
        return { kind: 'not_found' as const };
      }
      if (existing.isCompleted) {
        return { kind: 'already' as const };
      }

      const claimed = await tx.feedback.updateMany({
        where: { token, isCompleted: false },
        data: {
          foodRating,
          serviceRating,
          venueRating,
          comments,
          averageScore,
          isCompleted: true,
          completedAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        return { kind: 'already' as const };
      }

      const updated = await tx.feedback.findUniqueOrThrow({ where: { token } });
      const siblings = await tx.feedback.findMany({
        where: { bookingId: existing.bookingId },
      });

      return {
        kind: 'ok' as const,
        updated,
        siblings,
        bookingId: existing.bookingId,
        clientName: existing.clientName,
        clientSide: existing.clientSide,
      };
    });

    if (txResult.kind === 'not_found') {
      throw new NotFoundError(t(T.SERVER.ERRORS.FEEDBACK.INVALID_LINK));
    }

    if (txResult.kind === 'already') {
      throw new AppError(t(T.SERVER.ERRORS.FEEDBACK.ALREADY_SUBMITTED), {
        statusCode: 409,
        code: FEEDBACK_ALREADY_SUBMITTED_CODE,
      });
    }

    const { updated, siblings, bookingId, clientName, clientSide } = txResult;
    const combinedAverage = computeCombinedAverage(
      siblings.map((fb) => (fb.id === updated.id ? averageScore : fb.averageScore)),
    );

    const completedSides = siblings.filter((fb) => fb.isCompleted);
    const sideA = completedSides.find((fb) => fb.clientSide === 'A');
    const sideB = completedSides.find((fb) => fb.clientSide === 'B');
    const bothSidesComplete = Boolean(sideA && sideB);

    if (bothSidesComplete && sideA && sideB) {
      const anomaly = detectFeedbackDiscrepancy(sideA, sideB);
      if (anomaly.hasAnomaly) {
        const dashboardUrl = getFeedbackDashboardUrl(bookingId);
        const details =
          `${anomaly.reasons.join('; ')}\n`
          + `ממוצע משולב: ${combinedAverage ?? '—'}\n`
          + `לוח משובים: ${dashboardUrl}`;
        const brand = getBrandConfig();
        const managerEmail =
          process.env.MANAGER_EMAIL || brand.messaging.managerAlertEmail;
        const managerPhone = process.env.MANAGER_PHONE || MANAGER_PHONE;

        logger.warn('Feedback discrepancy / critical low scores', {
          bookingId,
          reasons: anomaly.reasons,
          dashboardUrl,
        });

        await Promise.allSettled([
          sendManagerFinancialAlert(
            managerPhone,
            'פער/משוב נמוך בין צדדים',
            clientName || 'לקוח',
            details,
            locale,
          ),
          managerEmail
            ? sendManagerFinancialAlertEmail(
                managerEmail,
                'פער/משוב נמוך בין צדדים',
                clientName || 'לקוח',
                details,
              )
            : Promise.resolve(),
        ]);
      }
    } else if (averageScore != null && averageScore < 3) {
      // Single-side critical average before the other side responds
      const managerEmail =
        process.env.MANAGER_EMAIL || getBrandConfig().messaging.managerAlertEmail;
      if (managerEmail) {
        await sendManagerFinancialAlertEmail(
          managerEmail,
          'משוב נמוך מאירוע',
          clientName || 'לקוח',
          `צד ${clientSide}, ממוצע ${averageScore}. ממוצע משולב: ${combinedAverage ?? 'טרם הושלם'}`,
        );
      }
    }

    emitFeedbackUpdated({ bookingId });

    res.status(200).json({
      success: true,
      message: t(T.SERVER.ERRORS.FEEDBACK.SAVED_SUCCESS),
      combinedAverage,
    });
  }),

  /** יצירת משובים ו/או שליחת קישורים ידנית */
  sendAdmin: catchAsync(async (req: AuthRequest, res: Response) => {
    const { tenantId } = req.user!;
    const { bookingId, clientSide, sendNotifications = true } = req.body as {
      bookingId: string;
      clientSide?: 'A' | 'B';
      sendNotifications?: boolean;
    };

    // Tenant-scoped lookup: a booking belonging to another tenant must be
    // indistinguishable from one that does not exist (no token/link disclosure).
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: { eventDate: true },
    });

    if (!booking) {
      throw new NotFoundError('ההזמנה לא נמצאה.');
    }

    if (booking.isOption) {
      throw AppError.badRequest('לא ניתן לשלוח משוב לאופציה — רק לאירוע סגור.');
    }

    // ARCHIVED is accepted: yesterday's events are archived at midnight and manual
    // re-send must keep working for them.
    if (
      !booking.eventDate
      || !FEEDBACK_ELIGIBLE_EVENT_STATUSES.includes(
        booking.eventDate.status as (typeof FEEDBACK_ELIGIBLE_EVENT_STATUSES)[number],
      )
    ) {
      throw AppError.badRequest('האירוע אינו בסטטוס סגור (BOOKED/ARCHIVED).');
    }

    const records = await ensureFeedbackRecordsForBooking(booking);
    if (records.length === 0) {
      throw AppError.badRequest('לא נמצאו פרטי קשר (מייל/טלפון) לשליחת משוב.');
    }

    let targets = records;
    if (clientSide) {
      targets = records.filter((r) => r.clientSide === clientSide);
    } else {
      targets = records.filter((r) => !r.isCompleted);
    }

    if (targets.length === 0) {
      throw AppError.badRequest(
        clientSide ? 'לא נמצא צד מתאים לשליחה.' : 'כל המשובים כבר מולאו.',
      );
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
  }),

  /** רשימת משובים למנהל — כולל אירועים שהסתיימו ללא משוב */
  listAdmin: catchAsync(async (req: AuthRequest, res: Response) => {
    const { tenantId } = req.user!;
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const now = new Date();

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const candidates = await prisma.booking.findMany({
      where: {
        tenantId,
        isOption: false,
        eventDate: {
          ...ELIGIBLE_EVENT_STATUS_FILTER,
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
  }),

  /** סטטיסטיקות וחישובים על משובי לקוחות */
  statsAdmin: catchAsync(async (req: AuthRequest, res: Response) => {
    const { tenantId } = req.user!;
    const period = parseStatsPeriod(req.query as Record<string, unknown>);
    const dateRange = eventDateFilter(period);
    const now = new Date();
    const availableYears = await getAvailableFeedbackYears(tenantId);

    const completedFeedbacksRaw = await prisma.feedback.findMany({
      where: {
        tenantId,
        isCompleted: true,
        booking: {
          tenantId,
          isOption: false,
          eventDate: {
            ...ELIGIBLE_EVENT_STATUS_FILTER,
            ...(dateRange ? { date: dateRange } : {}),
          },
        },
      },
      include: {
        booking: {
          include: { eventDate: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const completedFeedbacks = period.allYears && period.month
      ? completedFeedbacksRaw.filter(
          (f) => f.booking.eventDate && eventMonthMatches(f.booking.eventDate.date, period.month),
        )
      : completedFeedbacksRaw;

    // All numbers below are derived from the persisted responses on every call —
    // no maintained counters — by the shared, unit-tested aggregation module.
    const aggregate = aggregateFeedbackScores(completedFeedbacks as unknown as StatsFeedbackRow[]);
    const { averages, categoryComparison, byEventType } = aggregate;
    const { lowScore, excellent } = aggregate.counts;

    let byMonth: { month: number; label: string; average: number | null; count: number }[] = [];
    let byYear: { year: number; average: number | null; count: number }[] = [];

    if (!period.month && period.allYears) {
      byYear = groupByYear(completedFeedbacks as unknown as StatsFeedbackRow[]);
    } else if (!period.month && period.year != null) {
      byMonth = groupByMonth(completedFeedbacks as unknown as StatsFeedbackRow[]);
    }

    const candidatesRaw = await prisma.booking.findMany({
      where: {
        tenantId,
        isOption: false,
        eventDate: {
          ...ELIGIBLE_EVENT_STATUS_FILTER,
          ...(dateRange ? { date: dateRange } : {}),
        },
      },
      include: {
        eventDate: true,
        eventForm: { select: { eventTime: true } },
        feedbacks: true,
      },
    });

    const candidates = period.allYears && period.month
      ? candidatesRaw.filter(
          (b) => b.eventDate && eventMonthMatches(b.eventDate.date, period.month),
        )
      : candidatesRaw;

    const finishedBookings = candidates.filter(
      (b) => b.eventDate && hasEventEnded(b, b.eventDate.date, b.eventForm, now),
    );

    const totals = computeDeliveryTotals(finishedBookings, (booking) =>
      buildFeedbackSides(booking),
    );
    const { expectedSides, sentSides, pendingFeedbacks, notSentEvents } = totals;

    /**
     * COUNTING RULE (docs/FEEDBACK-FLOW.md): the unit is a RESPONSE (one recipient
     * / one clientSide), not an event — a wedding contributes two.
     *   responseRate = responses / surveys actually SENT
     *   coverageRate = responses / every recipient a finished event has
     */
    const responseRate = percentage(completedFeedbacks.length, sentSides);
    const coverageRate = percentage(completedFeedbacks.length, expectedSides);

    const recentLow = completedFeedbacks
      .filter((f) => f.averageScore != null && f.averageScore <= 3)
      .sort((a, b) => (a.averageScore ?? 0) - (b.averageScore ?? 0))
      .slice(0, 5)
      .map((f) => ({
        eventCode: f.booking.eventCode,
        eventDate: f.booking.eventDate?.date
          ? calendarKeyFromDbDate(new Date(f.booking.eventDate.date))
          : null,
        eventType: f.booking.eventType,
        clients: [f.booking.clientAFullName, f.booking.clientBFullName].filter(Boolean).join(' · '),
        clientSide: f.clientSide,
        score: f.averageScore!,
        comment: f.comments,
      }));

    const recentComments = completedFeedbacks
      .filter((f) => f.comments?.trim())
      .slice(0, 5)
      .map((f) => ({
        eventCode: f.booking.eventCode,
        eventDate: f.booking.eventDate?.date
          ? calendarKeyFromDbDate(new Date(f.booking.eventDate.date))
          : null,
        comment: f.comments!.trim(),
        score: f.averageScore,
      }));

    res.status(200).json({
      success: true,
      data: {
        period: {
          year: period.allYears ? null : period.year,
          month: period.month,
          allYears: period.allYears,
        },
        availableYears,
        averages,
        counts: {
          completedFeedbacks: completedFeedbacks.length,
          totalEventsFinished: finishedBookings.length,
          pendingFeedbacks,
          notSentEvents,
          lowScore,
          excellent,
          expectedSides,
          sentSides,
        },
        responseRate,
        coverageRate,
        byEventType,
        byMonth,
        byYear,
        categoryComparison,
        recentLow,
        recentComments,
      },
    });
  }),
};
