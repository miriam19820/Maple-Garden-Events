import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/errorHandler';
import prisma from '../config/prisma';
import { buildBookingPdfData, generateEventProductionPDF } from '../utils/pdfGenerator';
import { sendEventFormEmailIfAllowed } from '../utils/eventFormEmail';
import { emitEventFormsUpdated, emitBookingUpdated } from '../utils/realtime';
import { refreshBookingUpgradesAndContract } from '../utils/bookingUpgradesSync';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { NotFoundError } from '../utils/httpErrors';

function mapTableCreate(table: {
  id: number;
  x: number;
  y: number;
  section?: string | null;
  isHonor?: boolean;
  width?: number | null;
  height?: number | null;
}, tenantId: string) {
  return {
    tenantId,
    tableNumber: table.id,
    positionX: table.x,
    positionY: table.y,
    section: table.section ?? null,
    isHonor: table.isHonor ?? false,
    width: table.width ?? null,
    height: table.height ?? null,
  };
}

const EVENT_FORM_DB_FIELDS = [
  'eventTime',
  'receptionType',
  'finalGuestCount',
  'seatingType',
  'menPercent',
  'womenPercent',
  'honorTableCount',
  'tableclothId',
  'napkinId',
  'centerpiece',
  'bridgeChair',
  'hasLighting',
  'hasSoundSystem',
  'hasScreens',
  'hasFireworks',
  'entertainersBar',
  'entertainersSitting',
  'entertainersMen',
  'entertainersWomen',
  'depositCheckUrl',
  'depositCheckStatus',
  'depositCheckDetails',
  'akumCode',
  'kashrut',
  'guestPortionCount',
  'pricePerPortion',
  'kashrutSurcharge',
  'designPrice',
  'extrasJson',
  'totalPrice',
  'contractSigned',
  'notes',
  'menuSelections',
  'tableLayoutImageUrl',
] as const;

function pickEventFormDbFields(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    EVENT_FORM_DB_FIELDS
      .filter((key) => body[key] !== undefined)
      .map((key) => [key, body[key]]),
  );
}

export const eventFormController = {

  searchBookings: catchAsync(async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const bookings = await prisma.booking.findMany({
      where: {
        eventDate: { status: 'BOOKED' },
        OR: [
          { clientAFullName: { contains: q, mode: 'insensitive' } },
          { clientAIdNumber: { contains: q } },
          { clientBFullName: { contains: q, mode: 'insensitive' } },
          { clientBIdNumber: { contains: q } },
        ]
      },
      include: { eventDate: true, eventForm: true }
    });
    res.json({ success: true, data: bookings });
  }),

  upsertForm: catchAsync(async (req: AuthRequest, res: Response) => {
    const { tenantId } = req.user!;
    const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
    const { tables, ...rawBody } = req.body as { tables?: Parameters<typeof mapTableCreate>[0][] } & Record<string, unknown>;
    const formData = pickEventFormDbFields(rawBody);
    const tableRows = Array.isArray(tables) ? tables : undefined;

    const form = await prisma.eventForm.upsert({
      where: { bookingId },
      update: { 
        ...formData,
        tables: tableRows ? {
          deleteMany: {},
          create: tableRows.map(t => mapTableCreate(t, tenantId))
        } : undefined
      },
      create: { 
        tenantId,
        bookingId, 
        ...formData,
        tables: tableRows ? {
          create: tableRows.map(t => mapTableCreate(t, tenantId))
        } : undefined
      }
    });

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { eventDate: true },
    });

    if (booking) {
      const refreshed = await refreshBookingUpgradesAndContract(booking, form);
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          upgrades: refreshed.upgrades,
          extrasPrice: refreshed.extrasPrice,
          externalExtrasPrice: refreshed.externalExtrasPrice,
          totalPrice: refreshed.totalPrice,
          paymentTermsText: refreshed.paymentTermsText,
          contractText: refreshed.contractText,
          updatedBy: 'מערכת',
        },
      });
      emitBookingUpdated(bookingId);
    }

    let emailSent = false;
    let emailSkipped = false;
    let retryAfterSeconds: number | undefined;
    let emailError: string | undefined;

    try {
      const emailResult = await sendEventFormEmailIfAllowed(bookingId);
      if (emailResult.sent) {
        emailSent = true;
      } else if (emailResult.skipped) {
        emailSkipped = true;
        retryAfterSeconds = emailResult.retryAfterSeconds;
      } else {
        emailError = emailResult.error;
      }
    } catch (sendError) {
      logger.warn('Failed to send communications:', sendError);
      emailError = 'שגיאה בשליחת המייל';
    }

    res.json({
      success: true,
      data: form,
      emailSent,
      emailSkipped,
      retryAfterSeconds,
      emailError,
    });
    emitEventFormsUpdated();
  }),

  getForm: catchAsync(async (req: Request, res: Response) => {
    const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
    const form = await prisma.eventForm.findUnique({
      where: { bookingId },
      include: { 
        booking: { include: { eventDate: true } },
        tables: true 
      }
    });
    res.json(form);
  }),

  saveTables: catchAsync(async (req: AuthRequest, res: Response) => {
    const { tenantId } = req.user!;
    const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
    const { tables, tableLayoutImageUrl } = req.body;

    if (!Array.isArray(tables)) {
      throw AppError.badRequest('נדרש מערך tables');
    }

    const form = await prisma.eventForm.upsert({
      where: { bookingId },
      update: {
        ...(typeof tableLayoutImageUrl === 'string' ? { tableLayoutImageUrl } : {}),
        tables: {
          deleteMany: {},
          create: tables.map(t => mapTableCreate(t, tenantId)),
        },
      },
      create: {
        tenantId,
        bookingId,
        ...(typeof tableLayoutImageUrl === 'string' ? { tableLayoutImageUrl } : {}),
        tables: {
          create: tables.map(t => mapTableCreate(t, tenantId)),
        },
      },
      include: { tables: true },
    });

    res.json({ success: true, data: form });
    emitEventFormsUpdated();
  }),

  getAllForms: catchAsync(async (req: Request, res: Response) => {
    const forms = await prisma.eventForm.findMany({
      include: { booking: { include: { eventDate: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(forms);
  }),

  generatePDF: catchAsync(async (req: Request, res: Response) => {
    const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { 
        eventDate: true,
        eventForm: { include: { tables: true } }
      }
    });

    if (!booking || !booking.eventForm) {
      throw new NotFoundError('הזמנה או טופס לא נמצאו');
    }

    const pdfBuffer = await generateEventProductionPDF(buildBookingPdfData(booking));

    res.setHeader('Content-Type', 'application/pdf');
    // HTTP headers are latin1-only — Hebrew names must go through RFC 5987 filename*
    const asciiName = `event-form-${booking.eventCode || booking.id}.pdf`;
    const utf8Name = encodeURIComponent(`טופס-הפקה-${booking.clientAFullName || ''}.pdf`);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
    );
    res.send(pdfBuffer);
  }),

  sendEmail: catchAsync(async (req: Request, res: Response) => {
    const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
    const emailResult = await sendEventFormEmailIfAllowed(bookingId);

    if (emailResult.sent) {
      return res.json({ success: true, message: 'המייל נשלח בהצלחה' });
    }

    if (emailResult.skipped) {
      return res.json({
        success: true,
        skipped: true,
        message: 'המייל כבר נשלח לפני פחות מדקה',
        retryAfterSeconds: emailResult.retryAfterSeconds,
      });
    }

    if (emailResult.error === 'הזמנה או טופס לא נמצאו') {
      throw new NotFoundError(emailResult.error);
    }
    throw AppError.badRequest(emailResult.error || 'שגיאה בשליחת המייל');
  }),
};
