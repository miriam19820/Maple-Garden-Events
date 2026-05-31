import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendBumpEmail } from '../utils/mailer';
import { sendBumpWhatsApp } from '../utils/whatsapp';

export const createBooking = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const isManager = data.userRole === 'manager';

    // 1. הגדרת מערך התאריכים
    let datesToProcess: any[] = [];
    if (data.allSelectedDates && data.allSelectedDates.length > 0) {
      datesToProcess = data.allSelectedDates;
    } else if (data.calendarDateId) {
      datesToProcess = [data.calendarDateId];
    }

    if (datesToProcess.length === 0) {
      return res.status(400).json({ success: false, message: 'לא נבחרו תאריכים לאירוע.' });
    }

    // 2. זיהוי סטטוס
    const isOption = data.isOption === true || datesToProcess.length > 1;
    const newStatus = isOption ? 'OPTION' : 'BOOKED';

    let expiryDate: Date | null = null;
    if (newStatus === 'OPTION') {
      const hoursToAdd = data.optionDurationHours ? Number(data.optionDurationHours) : 48;
      expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + hoursToAdd);
    }

    // 3. חישובים ואיחוד שדות
    const calculatedTotalPrice = data.guestCount * data.finalPricePortion;
    const clientAPhoneCombined = data.clientAPhone2 ? `${data.clientAPhone} | נוסף: ${data.clientAPhone2}` : data.clientAPhone;
    const clientAAddressCombined = data.clientACity ? `${data.clientACity}, ${data.clientAAddress}` : data.clientAAddress;
    
    const clientBPhoneCombined = data.clientBPhone2 ? `${data.clientBPhone} | נוסף: ${data.clientBPhone2}` : data.clientBPhone;
    const clientBAddressCombined = data.clientBCity ? `${data.clientBCity}, ${data.clientBAddress}` : data.clientBAddress;

    const createdBookings = [];

    // 4. לולאה ליצירת הזמנות
    for (const dateItem of datesToProcess) {
      const dateString = typeof dateItem === 'object' && dateItem !== null ? dateItem.date : dateItem;
      const possibleDate = new Date(dateString);
      
      if (isNaN(possibleDate.getTime())) continue;

      const eventDate = await prisma.eventDate.upsert({
        where: { date: possibleDate },
        update: { status: newStatus, lockedBy: null, optionExpiresAt: expiryDate },
        create: { date: possibleDate, status: newStatus, optionExpiresAt: expiryDate }
      });

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

          calendarDateId: eventDate.id, 
          eventType: data.eventType,
          timeOfDay: data.timeOfDay || null,
          guestCount: Number(data.guestCount),
          finalPricePortion: Number(data.finalPricePortion),
          totalPrice: calculatedTotalPrice,
          
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
      include: { eventDate: true }
    });
    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'שגיאה בשליפת ההזמנות.' });
  }
};

export const releaseOptions = async (req: Request, res: Response) => {
  try {
    const { dateIds } = req.body; 
    if (!dateIds || dateIds.length === 0) return res.status(400).json({ success: false, message: 'לא נבחרו תאריכים לשחרור.' });

    await prisma.eventDate.updateMany({
      where: { id: { in: dateIds }, status: 'OPTION' },
      data: { status: 'AVAILABLE', lockedBy: null, optionExpiresAt: null, clientName: null, clientPhone: null, clientEmail: null }
    });

    await prisma.booking.deleteMany({ where: { calendarDateId: { in: dateIds } } });
    res.status(200).json({ success: true, message: 'התאריכים שוחררו בהצלחה וחזרו להיות פנויים בלוח.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'שגיאה בשחרור התאריכים.' });
  }
};

export const bumpOption = async (req: Request, res: Response) => {
  try {
    const { dateId } = req.body;
    if (!dateId) return res.status(400).json({ success: false, message: 'חסר מזהה תאריך.' });

    const eventDate = await prisma.eventDate.findUnique({
      where: { id: dateId },
      include: { booking: true } 
    });

    if (!eventDate || eventDate.status !== 'OPTION') return res.status(400).json({ success: false, message: 'התאריך אינו מוגדר כאופציה כרגע.' });

    const newDeadline = new Date();
    newDeadline.setHours(newDeadline.getHours() + 3);

    await prisma.eventDate.update({ where: { id: dateId }, data: { optionExpiresAt: newDeadline } });

    const clientAEmail = eventDate.booking?.clientAEmail || eventDate.clientEmail;
    const clientAPhone = eventDate.booking?.clientAPhone || eventDate.clientPhone;
    const clientAName = eventDate.booking?.clientAFullName || eventDate.clientName || 'לקוח יקר';
    
    if (clientAEmail) await sendBumpEmail(clientAEmail, clientAName, eventDate.date.toString(), newDeadline);
    if (clientAPhone) {
      const primaryPhoneA = clientAPhone.split(' | ')[0].trim();
      await sendBumpWhatsApp(primaryPhoneA, clientAName, eventDate.date.toString(), newDeadline);
    }

    if (eventDate.booking?.eventType === 'חתונה') {
      const clientBEmail = eventDate.booking.clientBEmail;
      const clientBPhone = eventDate.booking.clientBPhone;
      const clientBName = eventDate.booking.clientBFullName || 'צד הכלה';

      if (clientBEmail) await sendBumpEmail(clientBEmail, clientBName, eventDate.date.toString(), newDeadline);
      if (clientBPhone) {
        const primaryPhoneB = clientBPhone.split(' | ')[0].trim();
        await sendBumpWhatsApp(primaryPhoneB, clientBName, eventDate.date.toString(), newDeadline);
      }
    }

    res.status(200).json({ success: true, message: 'הדד-ליין קוצר.', newDeadline });
  } catch (error) {
    console.error("Error bumping option:", error);
    res.status(500).json({ success: false, message: 'שגיאה בהקפצת הלקוח.' });
  }
  };
  // --- פונקציה: סגירה סופית של אירוע (מעבר מאופציה לסגור + תשלומים + ניקוי שאר האופציות) ---
export const finalizeBooking = async (req: Request, res: Response) => {
  try {
    const { dateId, advancePaid, akumApprovalCode, hasMusic } = req.body;

    // 1. מציאת התאריך וההזמנה הספציפית שהלקוח בחר לסגור
    const selectedEventDate = await prisma.eventDate.findUnique({
      where: { id: dateId },
      include: { booking: true }
    });

    if (!selectedEventDate || !selectedEventDate.booking) {
      return res.status(404).json({ success: false, message: 'ההזמנה או התאריך לא נמצאו.' });
    }

    const booking = selectedEventDate.booking;

    // 2. עדכון התאריך הנבחר ל"סגור" (BOOKED)
    await prisma.eventDate.update({
      where: { id: dateId },
      data: { status: 'BOOKED', optionExpiresAt: null }
    });

    // 3. הוספת פרטי הכספים והרישוי להזמנה במסד הנתונים
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        hasMusic: hasMusic,
        akumApprovalCode: akumApprovalCode || null,
        advancePaid: Number(advancePaid) || 0,
        paidAmount: Number(advancePaid) || 0, // המקדמה שולמה
        paymentStatus: 'PARTIAL',
        // את כתובת צ'ק הביטחון והחוזה נוסיף כשנעלה את הקבצים
      }
    });

    // 4. הניקוי הגדול! מציאת שאר התאריכים שהלקוח שמר כאופציה ושחרור שלהם
    const otherOptions = await prisma.booking.findMany({
      where: {
        id: { not: booking.id }, // לא ההזמנה שכרגע סגרנו
        clientAPhone: booking.clientAPhone, // זיהוי לפי הטלפון של הלקוח
        eventDate: { status: 'OPTION' }
      }
    });

    const otherDateIds = otherOptions.map(o => o.calendarDateId);

    if (otherDateIds.length > 0) {
      // א. שחרור התאריכים בלוח
      await prisma.eventDate.updateMany({
        where: { id: { in: otherDateIds } },
        data: { status: 'AVAILABLE', optionExpiresAt: null, clientName: null, clientPhone: null, clientEmail: null }
      });
      
      // ב. מחיקת רשומות ההזמנה הזמניות מאותם תאריכים
      await prisma.booking.deleteMany({
        where: { calendarDateId: { in: otherDateIds } }
      });
      
      console.log(`[מערכת] שוחררו ${otherDateIds.length} תאריכים מיותרים של הלקוח.`);
    }

    res.status(200).json({ 
      success: true, 
      message: 'האירוע נסגר בהצלחה, הכספים עודכנו, ושאר האופציות של הלקוח שוחררו!' 
    });

  } catch (error) {
    console.error("Error finalizing booking:", error);
    res.status(500).json({ success: false, message: 'שגיאה בסגירת האירוע הסופית.' });
  }

};