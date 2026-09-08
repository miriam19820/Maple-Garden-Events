import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { requireRole } from '../middlewares/requireRole';
import { RBAC } from '../config/rbac';
import { validate } from '../middlewares/validate';
import {
  assignConversationHandler,
  createAutomation,
  deleteAutomation,
  deleteTemplateHandler,
  getConversation,
  getSettings,
  listAutomations,
  listConversationMessages,
  listConversations,
  listTemplatesHandler,
  sendMessage,
  sendMessageInConversation,
  updateAutomation,
  updateConversationStatusHandler,
  upsertTemplateHandler,
} from '../controllers/whatsapp.controller';
import {
  assignConversationSchema,
  conversationIdSchema,
  createAutomationSchema,
  listConversationsSchema,
  listMessagesSchema,
  sendInConversationSchema,
  sendMessageSchema,
  templateIdSchema,
  updateAutomationSchema,
  updateConversationStatusSchema,
  upsertTemplateSchema,
} from '../validators/whatsapp.validator';

const router = Router();

// Every route requires authentication; tenant scoping happens in the controller.
router.use(requireAuth);

// --- Conversations ---------------------------------------------------------
router.get('/conversations', requireRole(...RBAC.WHATSAPP_VIEW), validate(listConversationsSchema), listConversations);
router.get('/conversations/:id', requireRole(...RBAC.WHATSAPP_VIEW), validate(conversationIdSchema), getConversation);
router.get('/conversations/:id/messages', requireRole(...RBAC.WHATSAPP_VIEW), validate(listMessagesSchema), listConversationMessages);
router.put('/conversations/:id/assign', requireRole(...RBAC.WHATSAPP_VIEW), validate(assignConversationSchema), assignConversationHandler);
router.put('/conversations/:id/status', requireRole(...RBAC.WHATSAPP_VIEW), validate(updateConversationStatusSchema), updateConversationStatusHandler);

// --- Sending ---------------------------------------------------------------
router.post('/messages', requireRole(...RBAC.WHATSAPP_SEND), validate(sendMessageSchema), sendMessage);
router.post('/conversations/:id/messages', requireRole(...RBAC.WHATSAPP_SEND), validate(sendInConversationSchema), sendMessageInConversation);

// --- Templates -------------------------------------------------------------
router.get('/templates', requireRole(...RBAC.WHATSAPP_VIEW), listTemplatesHandler);
router.post('/templates', requireRole(...RBAC.WHATSAPP_MANAGE_TEMPLATES), validate(upsertTemplateSchema), upsertTemplateHandler);
router.delete('/templates/:id', requireRole(...RBAC.WHATSAPP_MANAGE_TEMPLATES), validate(templateIdSchema), deleteTemplateHandler);

// --- Automations -----------------------------------------------------------
router.get('/automations', requireRole(...RBAC.WHATSAPP_VIEW), listAutomations);
router.post('/automations', requireRole(...RBAC.WHATSAPP_MANAGE_AUTOMATIONS), validate(createAutomationSchema), createAutomation);
router.put('/automations/:id', requireRole(...RBAC.WHATSAPP_MANAGE_AUTOMATIONS), validate(updateAutomationSchema), updateAutomation);
router.delete('/automations/:id', requireRole(...RBAC.WHATSAPP_MANAGE_AUTOMATIONS), validate(templateIdSchema), deleteAutomation);

// --- Settings / health -----------------------------------------------------
router.get('/settings', requireRole(...RBAC.WHATSAPP_MANAGE_SETTINGS), getSettings);

export default router;
