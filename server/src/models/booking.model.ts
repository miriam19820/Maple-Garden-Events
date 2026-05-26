// server/src/models/booking.model.ts

export interface IBooking {
  id?: string; 
  

  clientDetails: {
    fullName: string;
    idNumber: string;
    email: string;
    phone: string;
    address: string;
  };


  eventDetails: {
    calendarDateId: string; 
    eventType: string; 
    guestCount: number; // כאן נאכוף את תקנון המינימום (350 איש)
    finalPricePortion: number; // מחיר מנה סופי שנסגר
  };

  // --- הערות (כמו שביקשת - מנהל ומזמין) ---
  comments: {
    managerComments: string; // הערות פנימיות של צוות הגן
    clientComments: string; // בקשות מיוחדות של הלקוח
  };

  // --- היסטוריה ולוגים (Audit Log) - לתיעוד מדויק של כל פעולה ---
  audit: {
    createdAt: Date; // מתי נפתחה ההזמנה
    createdBy: string; // איזה נציג פתח אותה
    updatedAt: Date; // מתי עודכנה לאחרונה
    updatedBy: string; // מי הנציג האחרון שערך שינויים
  };

  // --- כספים, תמחור וחוזים ---
  finance: {
    totalPrice: number; // סה"כ לתשלום
    paidAmount: number; // כמה כבר שולם (מקדמות)
    paymentStatus: 'pending' | 'partial' | 'completed'; // ממתין לתשלום / שולם חלקית / שולם במלואו
  };
}