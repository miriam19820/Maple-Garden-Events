import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { broadcastUpdate } from '../server'; // הוספת הייבוא של פונקציית השידור

// 1. שליפת התפריט
export const getMenu = async (req: Request, res: Response) => {
  try {
    const menu = await prisma.menuCategory.findMany({
      include: { dishes: true }
    });
    res.status(200).json({ success: true, data: menu });
  } catch (error) {
    res.status(500).json({ success: false, message: 'שגיאה בטעינת התפריט' });
  }
};

// 2. הוספת מנה
export const addDish = async (req: Request, res: Response) => {
  try {
    const { name, description, price, categoryId } = req.body;
    const newDish = await prisma.dish.create({
      data: { name, description, price, categoryId }
    });
    
    // שליחת עדכון לכל הלקוחות המחוברים
    broadcastUpdate('menuUpdated', { type: 'ADD', data: newDish });
    
    res.status(201).json({ success: true, data: newDish });
  } catch (error) {
    res.status(500).json({ success: false, message: 'שגיאה בהוספת מנה' });
  }
};

// 3. עדכון מנה
export const updateDish = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, price } = req.body;
    
    const updatedDish = await prisma.dish.update({
      where: { id: id as string },
      data: { name, description, price }
    });
    
    // שליחת עדכון לכל הלקוחות המחוברים
    broadcastUpdate('menuUpdated', { type: 'UPDATE', data: updatedDish });
    
    res.status(200).json({ success: true, data: updatedDish });
  } catch (error) {
    res.status(500).json({ success: false, message: 'שגיאה בעדכון מנה' });
  }
};

// 4. מחיקת מנה
export const deleteDish = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await prisma.dish.delete({ 
      where: { id: id as string } 
    });
    
    // שליחת עדכון לכל הלקוחות המחוברים שהמנה נמחקה
    broadcastUpdate('menuUpdated', { type: 'DELETE', id: id });
    
    res.status(200).json({ success: true, message: 'המנה נמחקה בהצלחה' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'שגיאה במחיקת מנה' });
  }
};