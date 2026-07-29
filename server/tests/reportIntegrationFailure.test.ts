import { reportIntegrationFailure } from '../src/utils/reportUnexpectedError';

const captureException = jest.fn();
const captureMessage = jest.fn();
const notifyCriticalAlert = jest.fn();

jest.mock('../src/config/sentry', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

jest.mock('../src/Services/criticalAlert.service', () => ({
  notifyCriticalAlert: (...args: unknown[]) => {
    notifyCriticalAlert(...args);
    return Promise.resolve();
  },
}));

describe('reportIntegrationFailure', () => {
  beforeEach(() => {
    captureException.mockClear();
    captureMessage.mockClear();
    notifyCriticalAlert.mockClear();
  });

  it('alerts on email auth_failed', () => {
    reportIntegrationFailure('email', new Error('Invalid login'), {
      operation: 'deliverMail',
      reason: 'auth_failed',
    });
    expect(captureException).toHaveBeenCalled();
    expect(notifyCriticalAlert).toHaveBeenCalled();
  });

  it('does not alert on ordinary email unknown failure', () => {
    reportIntegrationFailure('email', new Error('timeout'), {
      operation: 'deliverMail',
      reason: 'unknown',
    });
    expect(captureException).toHaveBeenCalled();
    expect(notifyCriticalAlert).not.toHaveBeenCalled();
  });

  it('alerts on WhatsApp OAuth-style codes', () => {
    reportIntegrationFailure('whatsapp', new Error('Invalid OAuth access token'), {
      operation: 'postMessages',
      reason: '190',
    });
    expect(notifyCriticalAlert).toHaveBeenCalled();
  });
});
