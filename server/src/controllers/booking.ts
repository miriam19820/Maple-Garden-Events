import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendBumpEmail } from '../utils/mailer';
import { sendBumpWhatsApp } from '../utils/whatsapp';

export const createBooking = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const isManager = data.userRole === 'manager';

    let datesToProcess: any[] = [];
    if (data.allSelectedDates && data.allSelectedDates.length > 0) {
      datesToProcess = data.allSelectedDates;
    } else if (data.calendarDateId) {
      datesToProcess = [data.calendarDateId];
    }

    if (datesToProcess.length === 0) {
      return res.status(400).json({ success: false, message: 'לא נבחרו תאריכים לאירוע.' });
    }

    const isOption = data.isOption === true || datesToProcess.length > 1;
    const newStatus = isOption ? 'OPTION' : 'BOOKED';

    let expiryDate: Date | null = null;
    if (newStatus === 'OPTION') {
      const hoursToAdd = data.optionDurationHours ? Number(data.optionDurationHours) : 48;
      expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + hoursToAdd);
    }

    const calculatedTotalPrice = data.guestCount * data.finalPricePortion;
    const clientAPhoneCombined = data.clientAPhone2 ? `${data.clientAPhone} | נוסף: ${data.clientAPhone2}` : data.clientAPhone;
    const clientAAddressCombined = data.clientACity ? `${data.clientACity}, ${data.clientAAddress}` : data.clientAAddress;
    const clientBPhoneCombined = data.clientBPhone2 ? `${data.clientBPhone} | נוסף: ${data.clientBPhone2}` : data.clientBPhone;
    const clientBAddressCombined = data.clientBCity ? `${data.clientBCity}, ${data.clientBAddress}` : data.clientBAddress;

    const createdBookings = [];

    for (const dateItem of datesToProcess) {
      const dateString = typeof dateItem === 'object' && dateItem !== null ? dateItem.date : dateItem;
      const possibleDate = new Date(dateString);
      
      if (isNaN(possibleDate.getTime())) continue;

      let eventDate = await prisma.eventDate.findFirst({ where: { date: possibleDate } });
      if (!eventDate) {
        eventDate = await prisma.eventDate.create({ data: { date: possibleDate, status: newStatus, optionExpiresAt: expiryDate } });
      } else {
        await prisma.eventDate.update({ where: { id: eventDate.id }, data: { status: newStatus, optionExpiresAt: expiryDate } });
      }

      const timeString = data.timeOfDay || (data.startTime && data.endTime ? `${data.startTime} - ${data.endTime}` : "לא צוין");

      const newBooking = await prisma.booking.create({
        data: {
          clientAFullName: data.clientAFullName,
          clientAIdNumber: data.clientAIdNumber,
          clientAPhone: clientAPhoneCombined,
          clientAEmail: data.clientAEmail || null,
          clientAAddress: clientAAddressCombined,
          clientBFullName: data.clientBFullName || null,
          clientBIdNumber: data.clientBIdNumber || null,
          clientBPhone: clientBPhoneCombined || null,
          clientBEmail: data.clientBEmail || null,
          clientBAddress: clientBAddressCombined || null,
          
          eventDate: { 
            connect: { id: eventDate.id } 
          },
          
          eventType: data.eventType,
          timeOfDay: timeString,
          guestCount: Number(data.guestCount) || 0,
          finalPricePortion: Number(data.finalPricePortion) || 0,
          totalPrice: calculatedTotalPrice || 0,
          hasMusic: data.hasMusic !== undefined ? data.hasMusic : true,
          akumApprovalCode: data.akumApprovalCode || null,
          advancePaid: 0,
          totalPaid: 0,
          securityCheckStatus: 'PENDING',
          isContractSigned: false,
          managerComments: data.managerComments || null,
          clientComments: data.clientComments || null,
          createdBy: isManager ? "מנהל מערכת" : "נציג מכירות",
        }
      });
      createdBookings.push(newBooking);
    }

    res.status(201).json({
      success: true,
      message: newStatus === 'OPTION' ? 'האופציות נשמרו בהצלחה!' : 'האירוע נשמר ונסגר בהצלחה!',
      data: createdBookings
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ success: false, message: 'שגיאה בשמירת הנתונים לשרת.' });
  }
};

export const getAllBookings = async (req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      include: { eventDate: true, eventForm: true }
    });
    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'שגיאה בשליפת ההזמנות.' });
  }
};

export const releaseOptions = async (req: Request, res: Response) => {
  try {
    const { dateIds, cancelReason, clientName } = req.body; 
    
    if (!dateIds || dateIds.length === 0) return res.status(400).json({ success: false, message: 'לא נבחרו תאריכים לשחרור.' });

    await prisma.eventDate.updateMany({
      where: { id: { in: dateIds } },
      data: { status: 'AVAILABLE', optionExpiresAt: null, clientName: null, clientPhone: null, clientEmail: null }
    });

    await prisma.booking.deleteMany({ 
      where: { eventDate: { id: { in: dateIds } } } 
    });
    
    if (cancelReason) {
      await prisma.cancellationLog.create({
        data: {
          reason: cancelReason,
          clientName: clientName || 'לא צוין',
        }
      });
    }

    res.status(200).json({ success: true, message: 'התאריכים שוחררו והסטטיסטיקה נשמרה בהצלחה.' });
  } catch (error) {
    console.error("Error releasing options:", error);
    res.status(500).json({ success: false, message: 'שגיאה בשחרור התאריכים.' });
  }
};

export const bumpOption = async (req: Request, res: Response) => {
  try {
    const { dateId } = req.body;
    const eventDate = await prisma.eventDate.findUnique({
      where: { id: dateId },
      include: { bookings: true } 
    });

    if (!eventDate || eventDate.status !== 'OPTION') return res.status(400).json({ success: false, message: 'התאריך אינו מוגדר כאופציה.' });

    const newDeadline = new Date();
    newDeadline.setHours(newDeadline.getHours() + 3);
    await prisma.eventDate.update({ where: { id: dateId }, data: { optionExpiresAt: newDeadline } });

    for (const booking of eventDate.bookings) {
        if (booking.clientAEmail) await sendBumpEmail(booking.clientAEmail, booking.clientAFullName, eventDate.date.toString(), newDeadline);
        if (booking.clientAPhone) {
            await sendBumpWhatsApp(booking.clientAPhone.split(' | ')[0].trim(), booking.clientAFullName, eventDate.date.toString(), newDeadline);
        }
    }

    res.status(200).json({ success: true, message: 'הדד-ליין קוצר.', newDeadline });
  } catch (error) {
    console.error("Error bumping option:", error);
    res.status(500).json({ success: false, message: 'שגיאה בהקפצת הלקוח.' });
  }
};

export const finalizeBooking = async (req: Request, res: Response) => {
  try {
    const { bookingId, advancePaid, akumApprovalCode, hasMusic } = req.body;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { eventDate: true }
    });

    if (!booking || !booking.eventDate) return res.status(404).json({ success: false, message: 'ההזמנה לא נמצאה.' });

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        hasMusic,
        akumApprovalCode,
        advancePaid: Number(advancePaid),
        paidAmount: Number(advancePaid),
        paymentStatus: 'PARTIAL',
      }
    });

    await prisma.eventDate.update({
      where: { id: booking.eventDate.id },
      data: { status: 'BOOKED', optionExpiresAt: null }
    });

    res.status(200).json({ success: true, message: 'האירוע נסגר בהצלחה!' });
  } catch (error) {
    console.error("Error finalizing booking:", error);
    res.status(500).json({ success: false, message: 'שגיאה בסגירת האירוע.' });
  }
};


export const getCancellationStats = async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query; // קבלת חודש ושנה מהבקשה

    let dateFilter = {};

    // אם המנהל בחר חודש ושנה ספציפיים
    if (month && year) {
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 1);
      dateFilter = {
        createdAt: {
          gte: startDate, // גדול או שווה לתחילת החודש
          lt: endDate,    // קטן מתחילת החודש הבא
        }
      };
    } 
    // אם המנהל בחר רק שנה (סיכום שנתי)
    else if (year) {
      const startDate = new Date(Number(year), 0, 1); // 1 בינואר של השנה
      const endDate = new Date(Number(year) + 1, 0, 1); // 1 בינואר של השנה הבאה
      dateFilter = {
        createdAt: {
          gte: startDate,
          lt: endDate,
        }
      };
    }

    // שליפת הנתונים מהמסד עם הסינון של התאריכים
    const stats = await prisma.cancellationLog.groupBy({
      by: ['reason'],
      where: dateFilter, // הוספנו את סינון התאריכים כאן!
      _count: {
        reason: true,
      },
      orderBy: {
        _count: {
          reason: 'desc',
        },
      },
    });

    const formattedStats = stats.map(stat => ({
      reason: stat.reason,
      count: stat._count.reason,
    }));

    res.status(200).json({ success: true, data: formattedStats });
  } catch (error) {
    console.error("Error fetching cancellation stats:", error);
    res.status(500).json({ success: false, message: 'שגיאה בשליפת סטטיסטיקת ביטולים.' });
  }
};