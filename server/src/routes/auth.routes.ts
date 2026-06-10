import { Router } from 'express';
import { login } from '../controllers/auth.controller';

const router = Router();

// נתיב ההתחברות שReact מחפש
router.post('/login', login);

export default router;