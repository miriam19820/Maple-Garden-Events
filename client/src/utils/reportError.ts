import * as Sentry from '@sentry/react';

export type ReportClientErrorOptions = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: Sentry.SeverityLevel;
};

/**
 * Report async / handler errors to Sentry without crashing into ErrorBoundary.
 * Use alongside toast/alert for user feedback.
 */
export function reportClientError(error: unknown, options?: ReportClientErrorOptions): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[reportClientError]', error, options?.extra);
    }
    return;
  }

  Sentry.withScope((scope) => {
    if (options?.tags) {
      for (const [key, value] of Object.entries(options.tags)) {
        scope.setTag(key, value);
      }
    }
    if (options?.extra) scope.setExtras(options.extra);
    if (options?.level) scope.setLevel(options.level);

    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage(String(error), options?.level ?? 'error');
    }
  });
}
