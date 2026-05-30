import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendBumpEmail } from '../utils/mailer';
import { sendBumpWhatsApp } from '../utils/whatsapp';

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

    // 2. זיהוי סטטוס: השרת מקבל מהטופס החלטה מפורשת אם זו אופציה או לא.
    // אם לא נשלח, הוא בודק אם יש יותר מתאריך אחד.
    const isOption = data.isOption === true || datesToProcess.length > 1;
    const newStatus = isOption ? 'OPTION' : 'BOOKED';

    // חישוב דד-ליין לאופציה לפי בחירת המנהל
    let expiryDate: Date | null = null;
    if (newStatus === 'OPTION') {
      // אם המנהל בחר זמן, נשתמש בו, אחרת ברירת המחדל היא 48 שעות
      const hoursToAdd = data.optionDurationHours ? Number(data.optionDurationHours) : 48;
      expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + hoursToAdd);
    }

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

      // יצירה או עדכון של התאריך במסד הנתונים עם הסטטוס החדש והדד-ליין
      const eventDate = await prisma.eventDate.upsert({
        where: { date: possibleDate },
        update: { 
          status: newStatus, 
          lockedBy: null,
          optionExpiresAt: expiryDate 
        },
        create: { 
          date: possibleDate, 
          status: newStatus,
          optionExpiresAt: expiryDate
        }
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
      orderBy: { createdAt: 'desc' },
      include: { eventDate: true } // השורה הקריטית שמודיעה למנהל שמדובר באופציה!
    });
    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'שגיאה בשליפת ההזמנות.' });
  }
};

// --- פונקציה: שחרור אופציות (תאריכים שלא נסגרו) ---
export const releaseOptions = async (req: Request, res: Response) => {
  try {
    const { dateIds } = req.body; 

    if (!dateIds || dateIds.length === 0) {
      return res.status(400).json({ success: false, message: 'לא נבחרו תאריכים לשחרור.' });
    }

    await prisma.eventDate.updateMany({
      where: { 
        id: { in: dateIds },
        status: 'OPTION' 
      },
      data: { 
        status: 'AVAILABLE', 
        lockedBy: null,
        optionExpiresAt: null,
        clientName: null,
        clientPhone: null,
        clientEmail: null
      }
    });

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

// --- פונקציה: הקפצת לקוח שמתחרה על תאריך (Bump) ---
export const bumpOption = async (req: Request, res: Response) => {
  try {
    const { dateId } = req.body;

    if (!dateId) {
      return res.status(400).json({ success: false, message: 'חסר מזהה תאריך.' });
    }

    const eventDate = await prisma.eventDate.findUnique({
      where: { id: dateId },
      include: { booking: true } 
    });

    if (!eventDate || eventDate.status !== 'OPTION') {
      return res.status(400).json({ success: false, message: 'התאריך אינו מוגדר כאופציה כרגע.' });
    }

    // מגדירים דד-ליין חדש - 3 שעות מעכשיו
    const newDeadline = new Date();
    newDeadline.setHours(newDeadline.getHours() + 3);

    await prisma.eventDate.update({
      where: { id: dateId },
      data: { optionExpiresAt: newDeadline }
    });

    // הכנת הפרטים לשליחה
    const clientAEmail = eventDate.booking?.clientAEmail || eventDate.clientEmail;
    const clientAPhone = eventDate.booking?.clientAPhone || eventDate.clientPhone;
    const clientAName = eventDate.booking?.clientAFullName || eventDate.clientName || 'לקוח יקר';
    
    // --- 1. שליחת התראות לצד א' (תמיד קיים) ---
    if (clientAEmail) {
      await sendBumpEmail(clientAEmail, clientAName, eventDate.date.toString(), newDeadline);
    } else {
      console.log(`[מערכת התראות] לצד א' (${clientAName}) אין אימייל מעודכן.`);
    }

    if (clientAPhone) {
      // 🌟 הפקת מספר ראשי נקי (חיתוך מחרוזות משולבות של טלפון חלופי)
      const primaryPhoneA = clientAPhone.split(' | ')[0].trim();
      await sendBumpWhatsApp(primaryPhoneA, clientAName, eventDate.date.toString(), newDeadline);
    } else {
      console.log(`[מערכת התראות] לצד א' (${clientAName}) אין טלפון מעודכן.`);
    }

    // --- 2. שליחת התראות לצד ב' (רק אם זו חתונה!) ---
    if (eventDate.booking?.eventType === 'חתונה') {
      const clientBEmail = eventDate.booking.clientBEmail;
      const clientBPhone = eventDate.booking.clientBPhone;
      const clientBName = eventDate.booking.clientBFullName || 'צד הכלה';

      console.log(`[מערכת התראות] זוהתה חתונה - שולח התראות גם לצד ב' (${clientBName})...`);

      if (clientBEmail) {
        await sendBumpEmail(clientBEmail, clientBName, eventDate.date.toString(), newDeadline);
      }
      if (clientBPhone) {
        // 🌟 הפקת מספר ראשי נקי גם עבור צד ב'
        const primaryPhoneB = clientBPhone.split(' | ')[0].trim();
        await sendBumpWhatsApp(primaryPhoneB, clientBName, eventDate.date.toString(), newDeadline);
      }
    }

    res.status(200).json({ 
      success: true, 
      message: 'הדד-ליין קוצר ל-3 שעות והלקוחות (כל הצדדים הרלוונטיים) עודכנו בהצלחה.',
      newDeadline
    });

  } catch (error) {
    console.error("Error bumping option:", error);
    res.status(500).json({ success: false, message: 'שגיאה בהקפצת הלקוח.' });
  }
};