import { Router } from 'express';
import { login } from '../controllers/auth.controller';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();
// נתיב להצגת רשימת המורשים
router.get('/authorized-users', async (req, res) => {
  const users = await prisma.authorizedUser.findMany();
  res.json(users);
});

// נתיב להוספת מנהל חדש
router.post('/authorized-users', async (req, res) => {
const { email } = req.body;
// ממיר לאותיות קטנות ומוריד רווחים בטעות לפני ואחרי
const cleanEmail = email.toLowerCase().trim(); 
const newUser = await prisma.authorizedUser.create({ data: { email: cleanEmail } });
  res.json(newUser);
});

// נתיב למחיקת מנהל
router.delete('/authorized-users/:id', async (req, res) => {
  await prisma.authorizedUser.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// נתיב ההתחברות שReact מחפש
router.post('/login', login);

export default router;