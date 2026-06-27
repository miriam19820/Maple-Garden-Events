import { Request, Response, NextFunction } from 'express';
import { AuthUser, extractBearerToken, verifyAuthToken } from '../utils/authCookie';

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({ success: false, message: 'גישה נדחתה. חסר טוקן התחברות.' });
    return;
  }

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch (error) {
    if (error instanceof Error && error.message === 'JWT_SECRET is not configured') {
      res.status(500).json({ success: false, message: 'שרת לא מוגדר לאימות (JWT_SECRET חסר).' });
      return;
    }
    res.status(401).json({ success: false, message: 'טוקן לא תקין או שפג תוקפו.' });
  }
};