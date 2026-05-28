import { Request, Response } from 'express';
import prisma from '../config/prisma';

export const createBooking = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const isManager = data.userRole === 'manager';

    // 1. הגדרת מערך התאריכים: אם הגיעו כמה תאריכים (אופציה), נשתמש בהם. אחרת, ניקח את התאריך הבודד.
    let datesToProcess: any[] = [];
    if (data.allSelectedDates && data.allSelectedDates.length > 0) {
      datesToProcess = data.allSelectedDates;
    } else if (data.calendarDateId) {
      datesToProcess = [data.calendarDateId];
    }

    if (datesToProcess.length === 0) {
      return res.status(400).json({ success: false, message: 'לא נבחרו תאריכים לאירוע.' });
    }

    // 2. זיהוי סטטוס חכם: תאריך אחד = סגור. יותר מאחד = שמירת אופציה.
    const newStatus = datesToProcess.length > 1 ? 'OPTION' : 'BOOKED';

    // 3. חישוב אוטומטי של המחיר הכולל ואיחוד שדות (מבוצע פעם אחת עבור כל הרשומות שייווצרו)
    const calculatedTotalPrice = data.guestCount * data.finalPricePortion;
    const clientAPhoneCombined = data.clientAPhone2 ? `${data.clientAPhone} | נוסף: ${data.clientAPhone2}` : data.clientAPhone;
    const clientAAddressCombined = data.clientACity ? `${data.clientACity}, ${data.clientAAddress}` : data.clientAAddress;
    
    const clientBPhoneCombined = data.clientBPhone2 ? `${data.clientBPhone} | נוסף: ${data.clientBPhone2}` : data.clientBPhone;
    const clientBAddressCombined = data.clientBCity ? `${data.clientBCity}, ${data.clientBAddress}` : data.clientBAddress;

    const createdBookings = [];

    // 4. לולאה שעוברת על כל תאריך שנבחר ויוצרת לו רשומה ואירוע
    for (const dateItem of datesToProcess) {
      // חילוץ בטוח של התאריך בין אם הוא נשלח כאובייקט ובין אם כמחרוזת
      const dateString = typeof dateItem === 'object' && dateItem !== null ? dateItem.date : dateItem;
      const possibleDate = new Date(dateString);
      
      if (isNaN(possibleDate.getTime())) {
        continue; // דילוג במידה והתאריך אינו חוקי
      }

      // יצירה או עדכון של התאריך במסד הנתונים עם הסטטוס החדש
      const eventDate = await prisma.eventDate.upsert({
        where: { date: possibleDate },
        update: { status: newStatus, lockedBy: null },
        create: { date: possibleDate, status: newStatus }
      });

      // יצירת ההזמנה לאותו תאריך ספציפי
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
          calendarDateId: eventDate.id, // חיבור למזהה של התאריך הנוכחי
          eventType: data.eventType,
          timeOfDay: data.timeOfDay || null,
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

      createdBookings.push(newBooking);
    }

    // 5. החזרת תשובה מסודרת ללקוח/מערכת
    res.status(201).json({
      success: true,
      message: newStatus === 'OPTION' ? 'האופציות נשמרו בהצלחה!' : 'האירוע נשמר ונסגר בהצלחה!',
      data: createdBookings
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

// --- פונקציה חדשה: שחרור אופציות (תאריכים שלא נסגרו) ---
export const releaseOptions = async (req: Request, res: Response) => {
  try {
    // מקבל מערך של מזהי תאריכים (UUIDs) למחיקה 
    const { dateIds } = req.body; 

    if (!dateIds || dateIds.length === 0) {
      return res.status(400).json({ success: false, message: 'לא נבחרו תאריכים לשחרור.' });
    }

    // מחזירים את התאריכים בלוח לסטטוס פנוי (רק אם הם היו בגדר אופציה)
    await prisma.eventDate.updateMany({
      where: { 
        id: { in: dateIds },
        status: 'OPTION' 
      },
      data: { 
        status: 'AVAILABLE', 
        lockedBy: null 
      }
    });

    // מוחקים את ההזמנות המקושרות לתאריכים האלו
    await prisma.booking.deleteMany({
      where: { 
        calendarDateId: { in: dateIds }
      }
    });

    res.status(200).json({ 
      success: true, 
      message: 'התאריכים שוחררו בהצלחה וחזרו להיות פנויים בלוח.' 
    });

  } catch (error) {
    console.error("Error releasing options:", error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בשחרור התאריכים בשרת.' 
    });
  }
};