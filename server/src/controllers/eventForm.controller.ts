import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { generateEventFormPDF } from '../utils/pdfGenerator';
import { sendPDFToClient, sendWhatsAppMessage } from '../Services/emailService';

export const eventFormController = {

  // חיפוש הזמנות לפי שם או ת"ז
  async searchBookings(req: Request, res: Response) {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';

      const bookings = await prisma.booking.findMany({
        where: {
          status: 'BOOKED',
          OR: [
            { clientAFullName: { contains: q, mode: 'insensitive' } },
            { clientAIdNumber: { contains: q } },
            { clientBFullName: { contains: q, mode: 'insensitive' } },
            { clientBIdNumber: { contains: q } },
          ]
        },
        include: { eventDate: true, eventForm: true }
      });
      res.json(bookings);
    } catch (e) {
      res.status(500).json({ error: 'שגיאה בחיפוש' });
    }
  },

  // שמירה/עדכון טופס + שליחת מייל/WhatsApp
  async upsertForm(req: Request, res: Response) {
    try {
      const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
      
      // מחלצים את הנתונים - מוציאים את ה-tables מה-body כדי לטפל בהם בנפרד
      const { id, createdAt, updatedAt, booking: _booking, bookingId: _bid, tables, ...formData } = req.body;

      // שמירה ב-DB כולל טבלאות השולחנות
      const form = await prisma.eventForm.upsert({
        where: { bookingId },
        update: { 
          ...formData,
          tables: tables ? {
            deleteMany: {}, // מוחקים את המיקומים הישנים
            create: tables.map((table: any) => ({
              tableNumber: table.id,
              positionX: table.x,
              positionY: table.y,
            }))
          } : undefined
        },
        create: { 
          bookingId, 
          ...formData,
          tables: tables ? {
            create: tables.map((table: any) => ({
              tableNumber: table.id,
              positionX: table.x,
              positionY: table.y,
            }))
          } : undefined
        }
      });

      // שליחת PDF ללקוח
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { eventDate: true }
      });

      if (booking) {
        try {
          const pdfData = {
            clientAFullName: booking.clientAFullName,
            clientAIdNumber: booking.clientAIdNumber,
            clientBFullName: booking.clientBFullName || undefined,
            clientBIdNumber: booking.clientBIdNumber || undefined,
            eventDate: booking.eventDate.date.toString(),
            guestCount: booking.guestCount,
            eventType: booking.eventType,
            timeOfDay: booking.timeOfDay || undefined,
            eventForm: form,
          };

          const pdfBuffer = await generateEventFormPDF(pdfData);

          const clientEmail = booking.clientAEmail || booking.clientBEmail;
          if (clientEmail) {
            await sendPDFToClient(clientEmail, booking.clientAFullName, booking.eventDate.date.toString(), pdfBuffer);
          }

          const clientPhone = booking.clientAPhone || booking.clientBPhone;
          if (clientPhone) {
            await sendWhatsAppMessage(clientPhone, booking.clientAFullName, booking.eventDate.date.toString());
          }
        } catch (emailError) {
          console.warn('Failed to send PDF:', emailError);
        }
      }

      res.json({ success: true, data: form });
    } catch (e) {
      console.error('Form upsert error:', e);
      res.status(500).json({ error: 'שגיאה בשמירת הטופס' });
    }
  },

  // שליפת טופס לפי bookingId
  async getForm(req: Request, res: Response) {
    try {
      const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
      const form = await prisma.eventForm.findUnique({
        where: { bookingId },
        include: { 
          booking: { include: { eventDate: true } },
          tables: true // מוסיף את השולחנות לשליפה
        }
      });
      res.json(form);
    } catch (e) {
      res.status(500).json({ error: 'שגיאה בשליפת הטופס' });
    }
  },

  // שליפת כל הטפסים
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

  // הפקת PDF
  async generatePDF(req: Request, res: Response) {
    try {
      const bookingId = typeof req.params.bookingId === 'string' ? req.params.bookingId : '';
      
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { 
          eventDate: true,
          eventForm: { include: { tables: true } } // כולל טבלאות ב-PDF
        }
      });

      if (!booking || !booking.eventForm) {
        return res.status(404).json({ error: 'הזמנה או טופס לא נמצאו' });
      }

      const pdfData = {
        clientAFullName: booking.clientAFullName,
        clientAIdNumber: booking.clientAIdNumber,
        clientBFullName: booking.clientBFullName || undefined,
        clientBIdNumber: booking.clientBIdNumber || undefined,
        eventDate: booking.eventDate.date.toString(),
        guestCount: booking.guestCount,
        eventType: booking.eventType,
        timeOfDay: booking.timeOfDay || undefined,
        eventForm: booking.eventForm,
      };

      const pdfBuffer = await generateEventFormPDF(pdfData);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="event-form-${new Date().toISOString().split('T')[0]}.pdf"`);
      res.send(pdfBuffer);
    } catch (e) {
      console.error('PDF generation error:', e);
      res.status(500).json({ error: 'שגיאה בהפקת PDF' });
    }
  }
};