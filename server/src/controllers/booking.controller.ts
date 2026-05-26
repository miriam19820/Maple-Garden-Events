import { Request, Response } from 'express';
import prisma from '../config/prisma';

// פונקציה ליצירת הזמנה חדשה (נקראת כשהטופס נשלח)
export const createBooking = async (req: Request, res: Response) => {
  try {
    const data = req.body; // הנתונים מהטופס

    // --- בדיקה: האם המשתמש הנוכחי הוא מנהל? ---
    const isManager = data.userRole === 'manager'; 


    // חישוב אוטומטי של המחיר הכולל
    const calculatedTotalPrice = data.guestCount * data.finalPricePortion;

    // שמירת ההזמנה במסד הנתונים בענן עם שני הצדדים
    const newBooking = await prisma.booking.create({
      data: {
        // --- פרטי צד א' (חובה) ---
        clientAFullName: data.clientAFullName,
        clientAIdNumber: data.clientAIdNumber,
        clientAPhone: data.clientAPhone,
        clientAEmail: data.clientAEmail || null,
        clientAAddress: data.clientAAddress || null,
        
        // --- פרטי צד ב' (רשות) ---
        clientBFullName: data.clientBFullName || null,
        clientBIdNumber: data.clientBIdNumber || null,
        clientBPhone: data.clientBPhone || null,
        clientBEmail: data.clientBEmail || null,
        clientBAddress: data.clientBAddress || null,

        // --- פרטי האירוע ותאריכים ---
        calendarDateId: data.calendarDateId,
        eventType: data.eventType,
        guestCount: data.guestCount,
        finalPricePortion: data.finalPricePortion,
        totalPrice: calculatedTotalPrice,
        
        // --- הערות (מנהל ומזמין) ---
        managerComments: data.managerComments || null,
        clientComments: data.clientComments || null,
        
        // --- היסטוריה ולוגים ---
        createdBy: isManager ? "מנהל מערכת" : "נציג מכירות",
        updatedBy: null
      }
    });

    res.status(201).json({
      success: true,
      message: isManager 
        ? 'ההזמנה אושרה ונשמרה (אישור מנהל הופעל בהצלחה!)' 
        : 'ההזמנה נוצרה ונשמרה בהצלחה במסד הנתונים!',
      data: newBooking
    });

  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ 
      success: false, 
      message: 'קרתה שגיאה בשרת בעת יצירת ההזמנה.' 
    });
  }
};

// פונקציה לשליפת כל ההזמנות (כדי להציג ברשימה למנהל)
export const getAllBookings = async (req: Request, res: Response) => {
  try {
    // בקשה מ-Prisma להביא את כל השורות מטבלת Booking
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: 'desc' } // יביא לנו את החדשים ביותר קודם
    });

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ 
      success: false, 
      message: 'קרתה שגיאה בשרת בעת שליפת ההזמנות.' 
    });
  }
};