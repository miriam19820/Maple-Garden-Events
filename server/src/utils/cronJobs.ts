import cron from 'node-cron';
import prisma from '../config/prisma';

export const startCronJobs = () => {
  console.log('⏳ שירות הטיימרים (Cron Jobs) הופעל בהצלחה.');

  // הביטוי '0 * * * *' אומר: תרוץ כל שעה עגולה (אפשר לשנות ל '* * * * *' כדי שירוץ כל דקה לבדיקות)
  cron.schedule('0 * * * *', async () => {
    console.log('--- מתחיל סריקה של אופציות שפג תוקפן ---');
    const now = new Date();

    try {
      // 1. מוצאים את כל התאריכים שהם באופציה והזמן שלהם עבר
      const expiredDates = await prisma.eventDate.findMany({
        where: {
          status: 'OPTION',
          optionExpiresAt: {
            lt: now // פחות מהזמן הנוכחי (כלומר, עבר הזמן)
          }
        }
      });

      if (expiredDates.length > 0) {
        const dateIds = expiredDates.map(d => d.id);

        // 2. מחזירים את התאריכים להיות פנויים בלוח
        await prisma.eventDate.updateMany({
          where: { id: { in: dateIds } },
          data: {
            status: 'AVAILABLE',
            lockedBy: null,
            optionExpiresAt: null,
            clientName: null,
            clientPhone: null,
            clientEmail: null
          }
        });

        // 3. מוחקים את ההזמנות הזמניות כדי לא ללכלך את מסד הנתונים
        await prisma.booking.deleteMany({
          where: { calendarDateId: { in: dateIds } }
        });

        console.log(`✅ נוקו ושוחרו ${expiredDates.length} אופציות שפג תוקפן.`);
      } else {
        console.log('אין אופציות שפג תוקפן כרגע.');
      }

    } catch (error) {
      console.error('שגיאה בניקוי אופציות אוטומטי:', error);
    }
  });
};