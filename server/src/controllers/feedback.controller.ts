import { Request, Response } from 'express';
import prisma from '../config/prisma';

export const feedbackController = {
  // 1. קריאת GET: בדיקת תקינות הקישור כשהלקוח פותח את הדף
  async verifyToken(req: Request, res: Response) {
    try {
      const token = req.params.token as string; // <--- התיקון שלנו כאן

      // מחפשים את המשוב לפי האסימון
      const feedback = await prisma.feedback.findUnique({
        where: { token },
      });

      if (!feedback) {
        return res.status(404).json({ success: false, message: 'הקישור אינו חוקי או שפג תוקפו.' });
      }

      // אם הלקוח כבר מילא ולחץ שלח, נחסום אותו
      if (feedback.isCompleted) {
        return res.status(400).json({ success: false, message: 'תודה! המשוב עבור אירוע זה כבר התקבל.' });
      }

      // אם הכל תקין, נחזיר ל-React את שם הלקוח כדי להציג לו "היי דוד..."
      res.status(200).json({ 
        success: true, 
        clientName: feedback.clientName,
        clientSide: feedback.clientSide
      });

    } catch (error) {
      console.error('Error verifying feedback token:', error);
      res.status(500).json({ success: false, message: 'שגיאת שרת בבדיקת הקישור.' });
    }
  },

  // 2. קריאת POST: קבלת התשובות ושמירה למסד הנתונים
  async submitFeedback(req: Request, res: Response) {
    try {
      const token = req.params.token as string; // <--- התיקון שלנו גם כאן
      const { foodRating, serviceRating, venueRating, comments } = req.body;

      // בדיקה שהקישור קיים וטרם מולא (הגנה כפולה)
      const existingFeedback = await prisma.feedback.findUnique({
        where: { token }
      });

      if (!existingFeedback || existingFeedback.isCompleted) {
        return res.status(400).json({ success: false, message: 'לא ניתן לשמור את המשוב.' });
      }

      // --- חישוב הממוצע (יהפוך לאחוזים בצד הלקוח) ---
      const scores = [foodRating, serviceRating, venueRating].filter(val => typeof val === 'number');
      let averageScore = null;
      
      if (scores.length > 0) {
        const sum = scores.reduce((a, b) => a + b, 0);
        // שומרים את הממוצע עם עד 2 ספרות אחרי הנקודה (למשל 4.66)
        averageScore = Number((sum / scores.length).toFixed(2)); 
      }

      // שומרים את הכל למסד הנתונים ונועלים את הטופס
      const updatedFeedback = await prisma.feedback.update({
        where: { token },
        data: {
          foodRating,
          serviceRating,
          venueRating,
          comments,
          averageScore,
          isCompleted: true // נועל את הקישור לתמיד
        }
      });

      // בונוס התראת מנהל: אם הממוצע מתחת ל-3 כוכבים, נדפיס למנהל אזהרה
      if (averageScore && averageScore <= 3) {
        console.warn(`[⚠️ התראת שירות] התקבל משוב נמוך (${averageScore} כוכבים) מהלקוח: ${updatedFeedback.clientName}`);
      }

      res.status(200).json({ success: true, message: 'המשוב נשמר בהצלחה!' });

    } catch (error) {
      console.error('Error submitting feedback:', error);
      res.status(500).json({ success: false, message: 'שגיאת שרת בשמירת המשוב.' });
    }
  }
};