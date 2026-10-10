/**
 * Direct tests for `deliverMail` — the branch every other suite reaches only
 * indirectly (audit §14).
 *
 * The point is the P0-1 invariant at its source: an unconfigured mailer must be
 * SIMULATED and must say so, so that nothing upstream can mistake it for a
 * delivery. It must also never open a transport, which is what makes the
 * development experience work offline.
 */

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const sendMail = jest.fn();
const verify = jest.fn();
const createTransport = jest.fn(() => ({ sendMail, verify }));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: (...args: unknown[]) => createTransport(...(args as [])) },
  createTransport: (...args: unknown[]) => createTransport(...(args as [])),
}));

import { canSendRealMail, deliverMail, resetTransporterForTests } from '../src/utils/mailer';

const EMAIL_KEYS = ['EMAIL_USER', 'EMAIL_PASS', 'EMAIL_PASSWORD'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of EMAIL_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  createTransport.mockClear();
  sendMail.mockReset();
  resetTransporterForTests();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetTransporterForTests();
});

function configure() {
  process.env.EMAIL_USER = 'venue@gmail.com';
  process.env.EMAIL_PASS = 'abcd efgh ijkl mnop';
}

describe('deliverMail — unconfigured (simulation)', () => {
  it('reports the result as simulated, never as a plain success', async () => {
    expect(canSendRealMail()).toBe(false);

    const result = await deliverMail({ to: 'someone@example.test', subject: 's' }, 'label');

    // `ok: true` alone must never be read as "delivered" — `simulated` is the flag
    // feedbackHelpers checks before stamping lastNotifiedAt.
    expect(result).toEqual({ ok: true, simulated: true });
  });

  it('never opens an SMTP transport', async () => {
    await deliverMail({ to: 'someone@example.test', subject: 's' }, 'label');
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('deliverMail — configured', () => {
  it('sends through the transport and reports a real, non-simulated success', async () => {
    configure();
    sendMail.mockResolvedValue({ messageId: 'x' });

    const result = await deliverMail({ to: 'someone@example.test', subject: 's' }, 'label');

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
    expect((result as { simulated?: boolean }).simulated).toBeUndefined();
  });

  it('classifies an SMTP auth rejection as auth_failed', async () => {
    configure();
    sendMail.mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }));

    expect(await deliverMail({ to: 'x@example.test', subject: 's' }, 'label')).toEqual({
      ok: false,
      reason: 'auth_failed',
    });

    sendMail.mockRejectedValue(Object.assign(new Error('535'), { responseCode: 535 }));
    expect(await deliverMail({ to: 'x@example.test', subject: 's' }, 'label')).toEqual({
      ok: false,
      reason: 'auth_failed',
    });
  });

  it('classifies anything else as unknown rather than throwing', async () => {
    configure();
    sendMail.mockRejectedValue(new Error('connection reset'));

    expect(await deliverMail({ to: 'x@example.test', subject: 's' }, 'label')).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('drops attachments whose file is missing instead of failing the send', async () => {
    configure();
    sendMail.mockResolvedValue({ messageId: 'x' });

    await deliverMail(
      {
        to: 'x@example.test',
        subject: 's',
        attachments: [{ filename: 'logo.png', path: '/nonexistent/logo.png', cid: 'l' }],
      },
      'label',
    );

    expect(sendMail.mock.calls[0][0].attachments).toEqual([]);
  });
});

describe('legacy credential spelling', () => {
  it('EMAIL_PASSWORD alone is enough to leave simulation mode', async () => {
    process.env.EMAIL_USER = 'venue@gmail.com';
    process.env.EMAIL_PASSWORD = 'abcdefghijklmnop';
    sendMail.mockResolvedValue({ messageId: 'x' });

    expect(canSendRealMail()).toBe(true);
    expect(await deliverMail({ to: 'x@example.test', subject: 's' }, 'label')).toEqual({ ok: true });
  });
});
