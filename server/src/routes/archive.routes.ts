import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { requireRole } from '../middlewares/requireRole';
import { RBAC } from '../config/rbac';
import {
  getArchiveEventsHandler,
  getArchiveSummaryHandler,
} from '../controllers/archive.controller';

const router = Router();
router.use(requireAuth);

router.get('/summary', requireRole(...RBAC.MANAGEMENT), getArchiveSummaryHandler);
router.get('/events', requireRole(...RBAC.MANAGEMENT), getArchiveEventsHandler);

export default router;
