import { Router } from 'express';
import { eventFormController } from '../controllers/eventForm.controller';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  bookingIdParamSchema,
  saveEventFormTablesSchema,
  upsertEventFormSchema,
} from '../validators/eventForm.validator';

const router = Router();
router.use(requireAuth);

router.get('/search',         eventFormController.searchBookings);
router.get('/',               eventFormController.getAllForms);

router.get('/:bookingId/pdf', validate(bookingIdParamSchema), eventFormController.generatePDF);
router.get('/:bookingId',     validate(bookingIdParamSchema), eventFormController.getForm);
router.post('/:bookingId',    validate(upsertEventFormSchema), eventFormController.upsertForm);
router.post('/:bookingId/tables', validate(saveEventFormTablesSchema), eventFormController.saveTables);
router.post('/:bookingId/send-email', validate(bookingIdParamSchema), eventFormController.sendEmail);

export default router;
