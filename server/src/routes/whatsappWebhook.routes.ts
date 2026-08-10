import express, { Router } from 'express';
import {
  handleWhatsAppWebhook,
  verifyWhatsAppWebhook,
} from '../controllers/whatsappWebhook.controller';
import { whatsappWebhookSignatureMiddleware } from '../middlewares/whatsappWebhookSignature';

const router = Router();

/** GET /api/whatsapp/webhook — Meta webhook verification challenge. */
router.get('/', verifyWhatsAppWebhook);

/**
 * POST /api/whatsapp/webhook — incoming messages / status updates.
 * Raw body required for X-Hub-Signature-256 verification.
 */
router.post(
  '/',
  express.raw({ type: 'application/json', limit: '1mb' }),
  whatsappWebhookSignatureMiddleware,
  handleWhatsAppWebhook,
);

export default router;
