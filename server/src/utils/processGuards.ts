import { logger } from './logger';
import { captureException, flushSentry } from '../config/sentry';
import { notifyCriticalAlert } from '../Services/criticalAlert.service';

let installed = false;

/**
 * Capture fatal process-level failures that bypass Express error middleware.
 * Install once at boot (after Sentry init).
 */
export function installProcessGuards(): void {
  if (installed) return;
  installed = true;

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled promise rejection', {
      message: error.message,
      stack: error.stack,
    });
    captureException(error, { kind: 'unhandledRejection' });
    void notifyCriticalAlert({
      title: 'Unhandled promise rejection',
      message: error.message,
      severity: 'critical',
      source: 'process.unhandledRejection',
      error,
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception — shutting down', {
      message: error.message,
      stack: error.stack,
    });
    captureException(error, { kind: 'uncaughtException' });
    void (async () => {
      await notifyCriticalAlert({
        title: 'Uncaught exception — process exiting',
        message: error.message,
        severity: 'critical',
        source: 'process.uncaughtException',
        error,
      });
      await flushSentry(2000);
      process.exit(1);
    })();
  });
}
