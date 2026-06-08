import { Request, Response, NextFunction } from 'express';

// פונקציית מעטפת (Wrapper) לקונטרולרים אסינכרוניים
// היא תתפוס שגיאות ותעביר אותן אוטומטית ל-Middleware המרכזי
export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Middleware לניהול שגיאות מרכזי
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('🔥 [Error]', err.stack || err.message);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'שגיאת שרת פנימית';

  res.status(statusCode).json({
    success: false,
    message,
    // בסביבת ייצור נרצה להסתיר את ה-stack trace
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};