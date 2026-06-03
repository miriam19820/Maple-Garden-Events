// tests/test-cancellations.ts
import prisma from '../src/config/prisma';
import { releaseOptions } from '../src/controllers/booking';
import { Request, Response } from 'express';

async function runCancellationTest() {
  console.log('--- מתחיל בדיקת מערכת ביטולים ---');

  try {
    // 1. יצירת אופציה לדוגמה כדי שנוכל לבטל אותה
    const testDate = await prisma.eventDate.create({
      data: {
        date: new Date('2026-12-31'),
        status: 'OPTION'
      }
    });

    console.log(`נוצרה אופציה לבדיקה עם ID: ${testDate.id}`);

    // 2. דימוי של בקשת ביטול מהצד של המנהל
    const req = {
      body: {
        dateIds: [testDate.id],
        cancelReason: 'יקר מדי',
        clientName: 'לקוח בדיקה'
      }
    } as unknown as Request;

    const res = {
      status: (code: number) => ({ json: (data: any) => console.log('תגובת שרת:', data) }),
    } as unknown as Response;

    // 3. הרצת פונקציית הביטול
    await releaseOptions(req, res);

    // 4. בדיקה במסד הנתונים: האם הסטטיסטיקה נשמרה?
    const log = await prisma.cancellationLog.findFirst({
      where: { clientName: 'לקוח בדיקה' }
    });

    if (log && log.reason === 'יקר מדי') {
      console.log('✅ הצלחה: סיבת הביטול נשמרה בבסיס הנתונים!');
    } else {
      console.error('❌ כישלון: הסטטיסטיקה לא נמצאה במסד הנתונים.');
    }

    // 5. בדיקה שהאופציה אכן שוחררה בלוח
    const dateStatus = await prisma.eventDate.findUnique({ where: { id: testDate.id } });
    if (dateStatus?.status === 'AVAILABLE') {
      console.log('✅ הצלחה: התאריך שוחרר וחזר להיות פנוי!');
    } else {
      console.error('❌ כישלון: התאריך עדיין חסום.');
    }

  } catch (error) {
    console.error('שגיאה בהרצת הטסט:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runCancellationTest();