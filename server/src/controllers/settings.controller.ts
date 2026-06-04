import { Request, Response } from 'express';
import prisma from '../config/prisma';

export const settingsController = {
  // =========================================
  // הגדרות מערכת (מע"מ, מחירי בסיס קבועים)
  // =========================================
  
  async getSettings(req: Request, res: Response) {
    try {
      // מנסים לשלוף את ההגדרות
      let settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
      
      // אם זו הפעם הראשונה שמפעילים את המערכת ואין עדיין הגדרות - ניצור אותן עם ברירות המחדל
      if (!settings) {
        settings = await prisma.systemSettings.create({ data: {} });
      }
      
      res.json(settings);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'שגיאה בשליפת הגדרות מערכת' });
    }
  },

  async updateSettings(req: Request, res: Response) {
    try {
      const data = req.body;
      const settings = await prisma.systemSettings.update({
        where: { id: 'global' },
        data
      });
      res.json(settings);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'שגיאה בעדכון הגדרות מערכת' });
    }
  },

  // =========================================
  // מחירון תוספות דינמיות (קטלוג שירותים)
  // =========================================

  async getExtras(req: Request, res: Response) {
    try {
      const extras = await prisma.extraService.findMany({
        orderBy: { category: 'asc' } // נסדר לפי קטגוריות שיהיה יפה
      });
      res.json(extras);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'שגיאה בשליפת תוספות' });
    }
  },

  async addExtra(req: Request, res: Response) {
    try {
      const { name, category, price } = req.body;
      const extra = await prisma.extraService.create({
        data: { name, category, price: Number(price) }
      });
      res.json(extra);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'שגיאה בהוספת תוספת למחירון' });
    }
  },

async updateExtra(req: Request, res: Response) {
    try {
      // כאן הוספנו את ה- as string כדי להרגיע את המערכת שזה טקסט יחיד
      const id = req.params.id as string; 
      const data = req.body;
      
      // המרה למספר במידה והגיע כטקסט מהטופס
      if (data.price !== undefined) data.price = Number(data.price);
      
      const extra = await prisma.extraService.update({
        where: { id },
        data
      });
      res.json(extra);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'שגיאה בעדכון תוספת' });
    }
  }}