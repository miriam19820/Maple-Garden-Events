import { Request, Response } from 'express';
import prisma from '../config/prisma';

export const createBooking = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const isManager = data.userRole === 'manager';

    // חישוב אוטומטי של המחיר הכולל
    const calculatedTotalPrice = data.guestCount * data.finalPricePortion;

    // איחוד שדות לפורמט שמסד הנתונים מכיר
    const clientAPhoneCombined = data.clientAPhone2 ? `${data.clientAPhone} | נוסף: ${data.clientAPhone2}` : data.clientAPhone;
    const clientAAddressCombined = data.clientACity ? `${data.clientACity}, ${data.clientAAddress}` : data.clientAAddress;
    
    const clientBPhoneCombined = data.clientBPhone2 ? `${data.clientBPhone} | נוסף: ${data.clientBPhone2}` : data.clientBPhone;
    const clientBAddressCombined = data.clientBCity ? `${data.clientBCity}, ${data.clientBAddress}` : data.clientBAddress;

    const newBooking = await prisma.booking.create({
      data: {
        // --- צד א' ---
        clientAFullName: data.clientAFullName,
        clientAIdNumber: data.clientAIdNumber,
        clientAPhone: clientAPhoneCombined,
        clientAEmail: data.clientAEmail || null,
        clientAAddress: clientAAddressCombined,
        
        // --- צד ב' (רק אם קיים) ---
        clientBFullName: data.clientBFullName || null,
        clientBIdNumber: data.clientBIdNumber || null,
        clientBPhone: clientBPhoneCombined || null,
        clientBEmail: data.clientBEmail || null,
        clientBAddress: clientBAddressCombined || null,

        // --- פרטי אירוע ---
        calendarDateId: data.calendarDateId,
        eventType: data.eventType,
        timeOfDay: data.timeOfDay || null, // שדה חדש!
        guestCount: Number(data.guestCount),
        finalPricePortion: Number(data.finalPricePortion),
        totalPrice: calculatedTotalPrice,
        
        // --- הערות ---
        managerComments: data.managerComments || null,
        clientComments: data.clientComments || null,
        
        // --- מערכת ---
        createdBy: isManager ? "מנהל מערכת" : "נציג מכירות",
      }
    });

    res.status(201).json({
      success: true,
      message: 'האירוע נשמר בהצלחה!',
      data: newBooking
    });

  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בשמירת הנתונים לשרת.' 
    });
  }
};

export const getAllBookings = async (req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'שגיאה בשליפת ההזמנות.' });
  }
};