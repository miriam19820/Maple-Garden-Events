/**
 * P0-1 regression suite: a PRODUCTION server must never silently simulate customer
 * email because EMAIL_USER / EMAIL_PASS are missing.
 *
 * "Not silently" is enforced without taking the system down — refusing to boot would
 * stop bookings, contracts and payments over a mail credential. Four behaviours are
 * locked in here:
 *   1. production + missing credential  → validateEnv() logs a CRITICAL error…
 *   2. …and still starts (no process.exit)
 *   3. non-production + missing         → warns only; the simulation fallback stays
 *   4. readiness reports the difference (ok / down / skipped) instead of hiding it,
 *      and a production `down` moves the aggregate to `degraded` — the alertable signal
 *
 * See docs/FEEDBACK-EMAIL-DELIVERY-AUDIT-2026-09-08.md §4 and §16 (blocker B-1).
 */

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { logger } from '../src/utils/logger';
import { validateEnv } from '../src/config/env';
import {
  describeEmailConfig,
  emailHealthCheck,
  getEmailPass,
  getEmailUser,
  isEmailRequired,
} from '../src/config/emailConfig';
import { aggregateHealthStatus, readinessHttpStatus } from '../src/Services/healthStatus';
import type { HealthCheckResult, HealthChecks } from '../src/Services/healthStatus';

const EMAIL_KEYS = ['EMAIL_USER', 'EMAIL_PASS', 'EMAIL_PASSWORD'] as const;

let saved: Record<string, string | undefined>;
let exitSpy: jest.SpyInstance;

beforeEach(() => {
  // `config/env` runs dotenv.config() at import time, so a developer machine with a
  // real server/.env would otherwise leak credentials into these cases.
  saved = {};
  for (const key of [...EMAIL_KEYS, 'NODE_ENV']) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  exitSpy.mockRestore();
});

function setProduction() {
  process.env.NODE_ENV = 'production';
}

/* ------------------------------------------------------------------ resolution */

describe('email credential resolution (single source of truth)', () => {
  it('is configured only when both a user and a password are present', () => {
    process.env.EMAIL_USER = 'venue@gmail.com';
    process.env.EMAIL_PASS = 'abcd efgh ijkl mnop';
    expect(describeEmailConfig()).toEqual({ configured: true, missing: [] });
  });

  it('reports EMAIL_USER as missing when only the password is set', () => {
    process.env.EMAIL_PASS = 'abcdefghijklmnop';
    expect(describeEmailConfig()).toEqual({ configured: false, missing: ['EMAIL_USER'] });
  });

  it('reports EMAIL_PASS as missing when only the user is set', () => {
    process.env.EMAIL_USER = 'venue@gmail.com';
    expect(describeEmailConfig()).toEqual({ configured: false, missing: ['EMAIL_PASS'] });
  });

  it('reports both as missing when neither is set', () => {
    expect(describeEmailConfig()).toEqual({
      configured: false,
      missing: ['EMAIL_USER', 'EMAIL_PASS'],
    });
  });

  it('accepts the legacy EMAIL_PASSWORD alias, exactly like the transport does', () => {
    process.env.EMAIL_USER = 'venue@gmail.com';
    process.env.EMAIL_PASSWORD = 'abcdefghijklmnop';
    // Regression: the old health check read EMAIL_PASS only and would have reported
    // a working mailer as unconfigured.
    expect(describeEmailConfig().configured).toBe(true);
  });

  it('treats whitespace-only values as missing', () => {
    process.env.EMAIL_USER = '   ';
    process.env.EMAIL_PASS = '   ';
    expect(describeEmailConfig().configured).toBe(false);
    expect(getEmailUser()).toBeUndefined();
    expect(getEmailPass()).toBeUndefined();
  });

  it('strips the spaces Google App Passwords are pasted with', () => {
    process.env.EMAIL_PASS = 'abcd efgh ijkl mnop';
    expect(getEmailPass()).toBe('abcdefghijklmnop');
  });

  it('requires email in production and only there', () => {
    setProduction();
    expect(isEmailRequired()).toBe(true);
    process.env.NODE_ENV = 'development';
    expect(isEmailRequired()).toBe(false);
    process.env.NODE_ENV = 'test';
    expect(isEmailRequired()).toBe(false);
    delete process.env.NODE_ENV;
    expect(isEmailRequired()).toBe(false);
  });
});

/* ------------------------------------------------------------ boot validation */

describe('validateEnv — production email configuration', () => {
  const errorText = () =>
    (logger.error as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');

  it('logs a critical error in production when EMAIL_USER is missing', () => {
    setProduction();
    process.env.EMAIL_PASS = 'abcdefghijklmnop';

    validateEnv();

    const message = errorText();
    expect(message).toContain('EMAIL_USER');
    expect(message).toMatch(/CRITICAL/);
    expect(message).toMatch(/SIMULATED/);
  });

  it('logs a critical error in production when EMAIL_PASS is missing', () => {
    setProduction();
    process.env.EMAIL_USER = 'venue@gmail.com';

    validateEnv();

    expect(errorText()).toContain('EMAIL_PASS');
  });

  it('logs a critical error in production when both are missing', () => {
    setProduction();

    validateEnv();

    expect(errorText()).toContain('EMAIL_USER');
    expect(errorText()).toContain('EMAIL_PASS');
  });

  it('does NOT stop the server — bookings must stay available without a mailer', () => {
    // Deliberate trade-off: the failure is made loud (critical log + readiness
    // "down"), not fatal. Refusing to boot would take the whole venue system down
    // over a mail credential. The readiness signal below is what must be alerted on.
    setProduction();

    validateEnv();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(emailHealthCheck().status).toBe('down');
  });

  it('starts in production when email is configured', () => {
    setProduction();
    process.env.EMAIL_USER = 'venue@gmail.com';
    process.env.EMAIL_PASS = 'abcdefghijklmnop';

    validateEnv();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('starts in production with the legacy EMAIL_PASSWORD alias', () => {
    setProduction();
    process.env.EMAIL_USER = 'venue@gmail.com';
    process.env.EMAIL_PASSWORD = 'abcdefghijklmnop';

    validateEnv();

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('outside production it warns but still starts — simulation stays the dev default', () => {
    process.env.NODE_ENV = 'development';

    validateEnv();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(
      (logger.warn as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n'),
    ).toMatch(/SIMULATED/);
  });
});

/* ------------------------------------------------------------------- readiness */

describe('readiness — email check', () => {
  it('is ok when configured', () => {
    process.env.EMAIL_USER = 'venue@gmail.com';
    process.env.EMAIL_PASS = 'abcdefghijklmnop';
    expect(emailHealthCheck()).toEqual({ status: 'ok', detail: 'configured' });
  });

  it('is DOWN — not skipped — when required in production but missing', () => {
    setProduction();
    const result = emailHealthCheck();
    expect(result.status).toBe('down');
    expect(result.detail).toContain('EMAIL_USER');
    expect(result.detail).toContain('SIMULATED');
  });

  it('is skipped outside production, preserving the existing dev signal', () => {
    process.env.NODE_ENV = 'development';
    expect(emailHealthCheck().status).toBe('skipped');
  });
});

describe('readiness — aggregate status reflects an unavailable mailer', () => {
  const check = (status: HealthCheckResult['status']): HealthCheckResult => ({ status });
  const checks = (partial: Partial<HealthChecks>): HealthChecks => ({
    database: check('ok'),
    redis: check('skipped'),
    s3: check('skipped'),
    email: check('skipped'),
    easycount: check('skipped'),
    ...partial,
  });

  it('a production server with no mailer is no longer reported as healthy', () => {
    setProduction();
    const report = checks({ email: emailHealthCheck() });
    expect(report.email.status).toBe('down');
    expect(aggregateHealthStatus(report)).toBe('degraded');
  });

  it('but it still serves traffic — only a down database returns 503', () => {
    setProduction();
    const status = aggregateHealthStatus(checks({ email: emailHealthCheck() }));
    expect(readinessHttpStatus(status)).toBe(200);
    expect(readinessHttpStatus(aggregateHealthStatus(checks({ database: check('down') })))).toBe(503);
  });

  it('a configured mailer leaves the aggregate at ok', () => {
    setProduction();
    process.env.EMAIL_USER = 'venue@gmail.com';
    process.env.EMAIL_PASS = 'abcdefghijklmnop';
    expect(aggregateHealthStatus(checks({ email: emailHealthCheck() }))).toBe('ok');
  });
});
