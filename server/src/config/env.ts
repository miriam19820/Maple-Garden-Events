import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
];

/**
 * WhatsApp is optional: the app must boot without it. But if someone turns it ON
 * with the live provider, the credentials must actually be there — failing at boot
 * beats failing silently on every send (§13, §35).
 */
const validateWhatsAppEnv = (): void => {
  const enabled = process.env.WHATSAPP_ENABLED?.trim().toLowerCase();
  if (enabled !== 'true' && enabled !== '1') return;

  const provider = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (provider === 'fake' || provider === 'disabled') {
    logger.warn(`WhatsApp is enabled with the "${provider}" provider — no real messages will be sent.`);
    return;
  }

  const missing = [
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    'WHATSAPP_WEBHOOK_APP_SECRET',
  ].filter((name) => {
    if (process.env[name]?.trim()) return false;
    // Accept the pre-existing variable names too.
    const legacy: Record<string, string> = {
      WHATSAPP_ACCESS_TOKEN: 'WHATSAPP_TOKEN',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'WHATSAPP_VERIFY_TOKEN',
      WHATSAPP_WEBHOOK_APP_SECRET: 'WHATSAPP_APP_SECRET',
    };
    const alias = legacy[name];
    return !(alias && process.env[alias]?.trim());
  });

  if (missing.length > 0) {
    logger.error(
      `Critical: WHATSAPP_ENABLED=true but these are missing: ${missing.join(', ')}. ` +
        'Set them, or use WHATSAPP_PROVIDER=fake for local development.',
    );
    process.exit(1);
  }
};

export const validateEnv = () => {
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);
  if (missing.length > 0) {
    logger.error(`Critical: missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  validateWhatsAppEnv();
  logger.info('Environment variables loaded successfully');
};