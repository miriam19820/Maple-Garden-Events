import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const login = async (req: Request, res: Response) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ success: false, message: 'לא נשלח טוקן אימות.' });
  }

  try {
    // 1. אימות הטוקן מול גוגל
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID, 
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ success: false, message: 'טוקן אימות לא חוקי.' });
    }

    const googleUserEmail = payload.email.toLowerCase().trim();
    const userName = payload.name || 'מנהל מערכת';

    // 2. בדיקת הרשאות (ניקוי רווחים ואותיות קטנות)
    const allowedEmails = (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map(email => email.trim().toLowerCase());

    console.log("--- בדיקת התחברות ---");
    console.log("מייל מגוגל (נקי):", googleUserEmail);
    console.log("רשימת מורשים:", allowedEmails);

    if (!allowedEmails.includes(googleUserEmail)) {
      console.log("❌ גישה נדחתה עבור:", googleUserEmail);
      return res.status(403).json({ 
        success: false, 
        message: 'אין למשתמש זה הרשאות גישה למערכת.' 
      });
    }

    // 3. ייצור טוקן פנימי
    const secret = process.env.JWT_SECRET || 'fallback_secret';
    const managerToken = jwt.sign(
      { email: googleUserEmail, role: 'manager', name: userName },
      secret,
      { expiresIn: '30d' }
    );

    return res.status(200).json({ 
      success: true, 
      message: 'התחברת בהצלחה',
      token: managerToken,
      user: { role: 'manager', name: userName, email: googleUserEmail }
    });

  } catch (error) {
    console.error('שגיאה באימות מול גוגל:', error);
    return res.status(401).json({ success: false, message: 'ההתחברות מול גוגל נכשלה.' });
  }
};