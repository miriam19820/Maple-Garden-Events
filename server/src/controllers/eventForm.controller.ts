import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { generateEventFormPDF } from '../utils/pdfGenerator';
import { sendEventFormEmailIfAllowed } from '../utils/eventFormEmail';
import { emitEventFormsUpdated } from '../utils/realtime';

function mapTableCreate(table: {
  id: number;
  x: number;
  y: number;
  section?: string | null;
  isHonor?: boolean;
  width?: number | null;
  height?: number | null;
}) {
  return {
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

  async searchBookings(req: Request, res: Response) {
    try {
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
    } catch (e) {
      res.status(500).json({ error: 'שגיאה בחיפוש' });
    }
  },

  async upsertForm(req: Request, res: Response) {
    try {
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
            create: tableRows.map(mapTableCreate)
          } : undefined
        },
        create: { 
          bookingId, 
          ...formData,
          tables: tableRows ? {
            create: tableRows.map(mapTableCreate)
          } : undefined
        }
      });

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
        console.warn('Failed to send communications:', sendError);
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
    } catch (e) {
      console.error('Form upsert error:', e);
      res.status(500).json({ error: 'שגיאה בשמירת הטופס' });
    }
  },

  async getForm(req: Request, res: Response) {
    try {
      const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
      const form = await prisma.eventForm.findUnique({
        where: { bookingId },
        include: { 
          booking: { include: { eventDate: true } },
          tables: true 
        }
      });
      res.json(form);
    } catch (e) {
      res.status(500).json({ error: 'שגיאה בשליפת הטופס' });
    }
  },

  async saveTables(req: Request, res: Response) {
    try {
      const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
      const { tables, tableLayoutImageUrl } = req.body;

      if (!Array.isArray(tables)) {
        return res.status(400).json({ error: 'נדרש מערך tables' });
      }

      const form = await prisma.eventForm.upsert({
        where: { bookingId },
        update: {
          ...(typeof tableLayoutImageUrl === 'string' ? { tableLayoutImageUrl } : {}),
          tables: {
            deleteMany: {},
            create: tables.map(mapTableCreate),
          },
        },
        create: {
          bookingId,
          ...(typeof tableLayoutImageUrl === 'string' ? { tableLayoutImageUrl } : {}),
          tables: {
            create: tables.map(mapTableCreate),
          },
        },
        include: { tables: true },
      });

      res.json({ success: true, data: form });
      emitEventFormsUpdated();
    } catch (e) {
      console.error('Save tables error:', e);
      res.status(500).json({ error: 'שגיאה בשמירת סידור שולחנות' });
    }
  },

  async getAllForms(req: Request, res: Response) {
    try {
      const forms = await prisma.eventForm.findMany({
        include: { booking: { include: { eventDate: true } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json(forms);
    } catch (e) {
      res.status(500).json({ error: 'שגיאה בשליפת הטפסים' });
    }
  },

  async generatePDF(req: Request, res: Response) {
    try {
      const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { 
          eventDate: true,
          eventForm: { include: { tables: true } }
        }
      });

      if (!booking || !booking.eventForm) {
        return res.status(404).json({ error: 'הזמנה או טופס לא נמצאו' });
      }

      const pdfData = {
        eventCode: booking.eventCode,
        clientAFullName: booking.clientAFullName,
        clientAIdNumber: booking.clientAIdNumber,
        clientBFullName: booking.clientBFullName || undefined,
        clientBIdNumber: booking.clientBIdNumber || undefined,
        eventDate: booking.eventDate.date.toString(),
        guestCount: booking.guestCount,
        minimumGuestCount: booking.minimumGuestCount ?? booking.guestCount,
        eventType: booking.eventType,
        timeOfDay: booking.timeOfDay || undefined,
        clientSignatureUrl: booking.clientSignatureUrl,
        contractText: booking.contractText,
        eventForm: booking.eventForm,
      };

      const pdfBuffer = await generateEventFormPDF(pdfData);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="event-form-${booking.clientAFullName}.pdf"`);
      res.send(pdfBuffer);
    } catch (e) {
      console.error('PDF generation error:', e);
      res.status(500).json({ error: 'שגיאה בהפקת PDF' });
    }
  },

  async sendEmail(req: Request, res: Response) {
    try {
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

      const status = emailResult.error === 'הזמנה או טופס לא נמצאו' ? 404 : 400;
      return res.status(status).json({ success: false, error: emailResult.error });
    } catch (e) {
      console.error('Send email error:', e);
      res.status(500).json({ error: 'שגיאה בשליחת המייל' });
    }
  }
};