import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { generateEventFormPDF } from '../utils/pdfGenerator';
import { sendPDFToClient, sendWhatsAppMessage } from '../Services/emailService';

export const eventFormController = {

  // חיפוש הזמנות לפי שם או ת"ז
  async searchBookings(req: Request, res: Response) {
    try {
      // וידוא בטוח שהשאילתה היא מחרוזת טקסט
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
      
      // מחלצים את הנתונים
      const { id, createdAt, updatedAt, booking: _booking, bookingId: _bid, ...formData } = req.body;

      const form = await prisma.eventForm.upsert({
        where:  { bookingId },
        update: { ...formData },
        create: { 
          bookingId, 
          ...formData 
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

          // שליחת מייל
          const clientEmail = booking.clientAEmail || booking.clientBEmail;
          if (clientEmail) {
            await sendPDFToClient(
              clientEmail,
              booking.clientAFullName,
              booking.eventDate.date.toString(),
              pdfBuffer
            );
          }

          // שליחת WhatsApp אם יש מספר
          const clientPhone = booking.clientAPhone || booking.clientBPhone;
          if (clientPhone) {
            await sendWhatsAppMessage(
              clientPhone,
              booking.clientAFullName,
              booking.eventDate.date.toString()
            );
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
        include: { booking: { include: { eventDate: true } } }
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
          eventForm: true
        }
      });

      if (!booking) {
        return res.status(404).json({ error: 'הזמנה לא נמצאה' });
      }

      if (!booking.eventForm) {
        return res.status(404).json({ error: 'טופס הפקת אירוע לא נמצא' });
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