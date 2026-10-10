import type { HealthCheckResult } from '../Services/healthStatus';

/**
 * Single source of truth for "can this process actually deliver customer email?".
 *
 * Boot validation (`config/env.ts`), the readiness health check
 * (`Services/health.service.ts`) and the transport itself (`utils/mailer.ts`) all
 * resolve the credentials through here, so they can never disagree — most
 * importantly about the legacy `EMAIL_PASSWORD` spelling, which the mailer has
 * always accepted but the health check previously did not.
 *
 * Deliberately dependency-free (no logger, no nodemailer, no prisma) so it can be
 * imported from env validation and unit-tested in isolation.
 */

/** Canonical names, used in operator-facing messages. */
export const EMAIL_ENV_VARS = ['EMAIL_USER', 'EMAIL_PASS'] as const;

export function getEmailUser(): string | undefined {
  return process.env.EMAIL_USER?.trim() || undefined;
}

export function getEmailPass(): string | undefined {
  // `EMAIL_PASSWORD` is the pre-existing alias; Google App Passwords are commonly
  // pasted with spaces, which SMTP auth does not accept.
  const pass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;
  return pass?.replace(/\s+/g, '') || undefined;
}

export type EmailConfigStatus = {
  configured: boolean;
  /** Canonical names of the variables that are missing. Empty when configured. */
  missing: string[];
};

export function describeEmailConfig(): EmailConfigStatus {
  const missing: string[] = [];
  if (!getEmailUser()) missing.push('EMAIL_USER');
  if (!getEmailPass()) missing.push('EMAIL_PASS');
  return { configured: missing.length === 0, missing };
}

/**
 * Email is mandatory in production and optional everywhere else.
 *
 * There is deliberately NO `EMAIL_ENABLED` switch: the post-event feedback flow is
 * a core product feature, so a production deployment that cannot send mail is a
 * misconfiguration, never an intentional mode. Outside production the mailer's
 * simulation fallback remains the intended developer experience.
 */
export function isEmailRequired(): boolean {
  return (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

/**
 * Readiness classification for the email dependency.
 *
 *   configured                → ok       ("configured")
 *   missing, production       → down     (aggregate readiness becomes "degraded")
 *   missing, non-production   → skipped  (unchanged development behaviour)
 *
 * The production case must never be `skipped`: a skipped check does not move the
 * aggregate status, which is exactly how a silently simulating mailer used to look
 * identical to a healthy one.
 */
export function emailHealthCheck(): HealthCheckResult {
  const { configured, missing } = describeEmailConfig();

  if (configured) {
    return { status: 'ok', detail: 'configured' };
  }

  if (isEmailRequired()) {
    return {
      status: 'down',
      detail:
        `email is required in production but not configured (${missing.join(', ')} missing) — `
        + 'customer mail would be SIMULATED, not delivered',
    };
  }

  return {
    status: 'skipped',
    detail: `${missing.join(', ')} not set — mail is simulated (non-production)`,
  };
}
