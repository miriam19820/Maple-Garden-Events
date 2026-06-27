import { Router } from 'express';
import { settingsController } from '../controllers/settings.controller';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  addExtraSchema,
  addStaffSchema,
  deleteStaffSchema,
  updateExtraSchema,
  updateSettingsSchema,
} from '../validators/settings.validator';

const router = Router();
router.use(requireAuth);

// נתיבים להגדרות כלליות (מע"מ, מחירי בסיס)
router.get('/global', settingsController.getSettings);
router.put('/global', validate(updateSettingsSchema), settingsController.updateSettings);

// נתיבים למחירון תוספות דינמי
router.get('/extras', settingsController.getExtras);
router.post('/extras', validate(addExtraSchema), settingsController.addExtra);
router.put('/extras/:id', validate(updateExtraSchema), settingsController.updateExtra);

router.get('/staff', settingsController.getStaff);
router.post('/staff', validate(addStaffSchema), settingsController.addStaff);
router.delete('/staff/:id', validate(deleteStaffSchema), settingsController.deleteStaff);

export default router;