import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { describeEmailConfig, isEmailRequired } from './emailConfig';

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

/**
 * Email follows the same principle as WhatsApp above, with two differences: it is
 * not opt-in (post-event feedback is a core product feature, so there is deliberately
 * no `EMAIL_ENABLED` switch), and a missing credential does NOT stop the server.
 *
 * Without credentials the mailer falls back to simulation (mailer.ts `deliverMail`).
 * That fallback is correct and stays: a simulated send is never counted as delivered,
 * so rows stay retryable. The danger was only that it was *silent* — every customer
 * survey evaporating while every dashboard read "0 sent", indistinguishable from
 * "no events happened".
 *
 * Deliberate trade-off: refusing to boot would take down bookings, contracts and
 * payments over a mail credential, so the failure is made LOUD instead of fatal —
 *   1. a critical, unmissable error in the boot log, and
 *   2. `/health/ready` → `checks.email: down` → aggregate `degraded`
 *      (Services/health.service.ts, via config/emailConfig.emailHealthCheck).
 * The second one is what monitoring must alert on; the log alone can be scrolled past.
 *
 * Outside production the same state is an ordinary warning — simulation is the
 * intended developer experience there.
 */
const validateEmailEnv = (): void => {
  const { configured, missing } = describeEmailConfig();
  if (configured) return;

  if (!isEmailRequired()) {
    logger.warn(
      `Email is not configured (${missing.join(', ')}) — outgoing mail will be SIMULATED, not sent. `
        + 'Expected outside production.',
    );
    return;
  }

  logger.error(
    `CRITICAL: NODE_ENV=production but email is NOT configured — ${missing.join(', ')} missing. `
      + 'Every customer email (post-event feedback surveys included) will be SIMULATED and NOT delivered. '
      + 'The server is starting anyway so the rest of the system stays available, and '
      + '/health/ready reports email as "down" (overall status "degraded") until this is fixed. '
      + 'Set them in the server env file (EMAIL_PASSWORD is accepted as a legacy alias for EMAIL_PASS).',
  );
};

export const validateEnv = () => {
  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);
  if (missing.length > 0) {
    logger.error(`Critical: missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  validateWhatsAppEnv();
  validateEmailEnv();
  logger.info('Environment variables loaded successfully');
};