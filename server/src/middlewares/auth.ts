import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// תיקנו כאן: שינינו מ-id ל-email כדי שיתאים לטוקן החדש של גוגל
export interface AuthRequest extends Request {
  user?: { email: string; role: string; name: string };
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'גישה נדחתה. חסר טוקן התחברות.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET || 'fallback_secret';
    // גם כאן עדכנו את סוג הנתונים ל-email
    const decoded = jwt.verify(token, secret) as { email: string; role: string; name: string };
    
    req.user = decoded;
    next(); 
  } catch (err) {
    res.status(401).json({ success: false, message: 'טוקן לא תקין או שפג תוקפו.' });
    return;
  }
};