import { captureException, captureMessage } from '../config/sentry';
import { notifyCriticalAlert } from '../Services/criticalAlert.service';
import { logger } from './logger';
import { AppError, isOperationalError } from './AppError';

export type ReportUnexpectedOptions = {
  /** Logical source tag, e.g. bookingLifecycle.pdf, easyCount.liveFailed */
  source: string;
  title?: string;
  context?: Record<string, unknown>;
  /**
   * Fire webhook/email alert (default true).
   * Set false for noisy paths that only need Sentry breadcrumbs.
   */
  alert?: boolean;
  severity?: 'critical' | 'error';
};

/**
 * Report unexpected failures outside Express errorHandler
 * (fire-and-forget side effects, soft-fail integrations, silent catch sites).
 *
 * Skips alerting for operational AppErrors / 4xx duck-types (still logs a warning).
 */
export function reportUnexpectedError(error: unknown, options: ReportUnexpectedOptions): void {
  const message = error instanceof Error ? error.message : String(error);
  const title = options.title || `Unexpected error: ${options.source}`;
  const context = {
    ...options.context,
    ...(error instanceof AppError ? error.context : undefined),
  };

  if (isOperationalError(error) && !(error instanceof AppError && !error.isOperational)) {
    const statusCode =
      error instanceof AppError
        ? error.statusCode
        : Number((error as { statusCode?: number }).statusCode);
    if (Number.isFinite(statusCode) && statusCode < 500) {
      logger.warn('Operational error in unexpected-error reporter (skipped Sentry/alert)', {
        source: options.source,
        message,
        statusCode,
        context,
      });
      return;
    }
  }

  logger.error(title, {
    source: options.source,
    message,
    stack: error instanceof Error ? error.stack : undefined,
    context,
  });

  if (error instanceof Error || error) {
    captureException(error instanceof Error ? error : new Error(message), {
      source: options.source,
      ...context,
    });
  } else {
    captureMessage(title, 'error', { source: options.source, ...context });
  }

  if (options.alert === false) return;

  void notifyCriticalAlert({
    title,
    message,
    severity: options.severity ?? 'error',
    source: options.source,
    context,
    error,
  });
}

/** Convenience for background / post-commit side effects with booking context. */
export function reportSideEffectFailure(
  step: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  reportUnexpectedError(error, {
    source: `sideEffect:${step}`,
    title: `Side effect failed: ${step}`,
    context,
    severity: 'error',
    alert: true,
  });
}
