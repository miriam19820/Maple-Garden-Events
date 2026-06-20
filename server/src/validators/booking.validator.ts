import { z } from 'zod';

export const HALL_ONLY_EVENT_TYPE = 'השכרת אולם בלי אוכל';

export function isHallOnlyBooking(data: { eventType?: string }): boolean {
  return data.eventType === HALL_ONLY_EVENT_TYPE;
}

/** Treat empty strings / null as undefined so optional numeric fields are not coerced to 0. */
const optionalNumber = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : val),
  z.coerce.number().optional()
);

export const createBookingSchema = z.object({
  body: z.object({
    clientAFullName: z.string({ message: "שם לקוח הוא חובה" }).min(2, "שם הלקוח חייב להכיל לפחות 2 תווים"),
    clientAPhone: z.string({ message: "טלפון הוא חובה" }).min(9, "מספר טלפון לא תקין"),

    guestCount: optionalNumber,
    finalPricePortion: optionalNumber,
    hallRentalPrice: optionalNumber,
    servingStyle: z.string().optional(),
    
    clientAEmail: z.string().email("כתובת אימייל לא תקינה").optional().or(z.literal('')),
    clientBFullName: z.string().optional(),

    timeOfDay: z.string({ message: "חובה לבחור שעת אירוע" }).min(1, "חובה לבחור שעת אירוע"),
    eventType: z.string({ message: "חובה לבחור סוג אירוע" }).min(1, "חובה לבחור סוג אירוע"),

    allSelectedDates: z.array(z.any()).optional(),
    calendarDateId: z.string().optional(),
  })
    .refine((data) => data.allSelectedDates?.length || data.calendarDateId, {
      message: "חובה לבחור לפחות תאריך אחד לאירוע",
      path: ["allSelectedDates"],
    })
    .superRefine((data, ctx) => {
      if (isHallOnlyBooking(data)) {
        const price = Number(data.hallRentalPrice);
        if (!Number.isFinite(price) || price <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "יש להזין מחיר השכרת אולם",
            path: ["hallRentalPrice"],
          });
        }
        return;
      }

      const guestCount = Number(data.guestCount);
      if (!Number.isFinite(guestCount) || guestCount <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "חובה להזין מספר אורחים",
          path: ["guestCount"],
        });
      }

      const portionPrice = Number(data.finalPricePortion);
      if (!Number.isFinite(portionPrice) || portionPrice <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "חובה להזין מחיר מנה",
          path: ["finalPricePortion"],
        });
      }
    }),
});