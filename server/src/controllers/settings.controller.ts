import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { catchAsync } from '../middlewares/errorHandler'; // <-- ייבוא של עוטף השגיאות

export const settingsController = {
  // =========================================
  // הגדרות מערכת (מע"מ, מחירי בסיס קבועים)
  // =========================================
  
  getSettings: catchAsync(async (req: Request, res: Response) => {
    // מנסים לשלוף את ההגדרות
    let settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
    
    // אם זו הפעם הראשונה שמפעילים את המערכת ואין עדיין הגדרות - ניצור אותן עם ברירות המחדל
    if (!settings) {
      settings = await prisma.systemSettings.create({ data: {} });
    }
    
    res.json(settings);
  }),

  updateSettings: catchAsync(async (req: Request, res: Response) => {
    const data = req.body;
    const settings = await prisma.systemSettings.update({
      where: { id: 'global' },
      data
    });
    res.json(settings);
  }),

  // =========================================
  // מחירון תוספות דינמיות (קטלוג שירותים)
  // =========================================

  getExtras: catchAsync(async (req: Request, res: Response) => {
    const extras = await prisma.extraService.findMany({
      orderBy: { category: 'asc' } // נסדר לפי קטגוריות שיהיה יפה
    });
    res.json(extras);
  }),

  addExtra: catchAsync(async (req: Request, res: Response) => {
    const { name, category, price } = req.body;
    const extra = await prisma.extraService.create({
      data: { name, category, price: Number(price) }
    });
    res.json(extra);
  }),

  updateExtra: catchAsync(async (req: Request, res: Response) => {
    const data = req.body;
    
    // המרה למספר במידה והגיע כטקסט מהטופס
    if (data.price !== undefined) data.price = Number(data.price);
    
    const extra = await prisma.extraService.update({
      where: { id: req.params.id as string }, // התיקון שהורג את השגיאה של TypeScript
      data
    });
    res.json(extra);
  })
};