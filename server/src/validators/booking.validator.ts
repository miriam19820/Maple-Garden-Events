import { z } from 'zod';

export const createBookingSchema = z.object({
  body: z.object({
    // שינינו מ-required_error ל-message כפי שהקומפיילר ביקש, והוספנו min
    clientAFullName: z.string({ message: "שם לקוח הוא חובה" }).min(2, "שם הלקוח חייב להכיל לפחות 2 תווים"),
    clientAPhone: z.string({ message: "טלפון הוא חובה" }).min(9, "מספר טלפון לא תקין"),
    
    // קבלת מספרים
    guestCount: z.coerce.number({ message: "חובה להזין מספר אורחים" }).int().positive("מספר אורחים חייב להיות חיובי (מעל 0)"),
    finalPricePortion: z.coerce.number({ message: "חובה להזין מחיר מנה" }).positive("מחיר מנה חייב להיות מספר חיובי"),
    
    // שדות שהם אופציונליים
    clientAEmail: z.string().email("כתובת אימייל לא תקינה").optional().or(z.literal('')),
    clientBFullName: z.string().optional(),
    
    timeOfDay: z.string({ message: "חובה לבחור שעת אירוע" }).min(1, "חובה לבחור שעת אירוע"),
    eventType: z.string({ message: "חובה לבחור סוג אירוע" }).min(1, "חובה לבחור סוג אירוע"),
    
    // תאריכים
    allSelectedDates: z.array(z.any()).optional(),
    calendarDateId: z.string().optional(),
  }).refine((data) => data.allSelectedDates?.length || data.calendarDateId, {
    message: "חובה לבחור לפחות תאריך אחד לאירוע",
    // תוקן השדה שאליו משויכת השגיאה
    path: ["allSelectedDates"]
  })
});