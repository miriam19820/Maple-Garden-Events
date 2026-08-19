import { reportClientError, type ReportClientErrorOptions } from './reportError';

export type RunUserActionOptions = {
  /** Sentry tags (e.g. source: HallInvoicesPanel) */
  tags?: ReportClientErrorOptions['tags'];
  extra?: ReportClientErrorOptions['extra'];
  level?: ReportClientErrorOptions['level'];
  /** Called after reporting — use for toast/alert/setError */
  onError?: (error: unknown, message: string) => void;
  fallbackMessage?: string;
};

/**
 * Run a user-triggered async action: report failures to Sentry, keep UX feedback local.
 * Does not throw into ErrorBoundary (recoverable API errors stay in-page).
 */
export async function runUserAction<T>(
  fn: () => Promise<T>,
  options: RunUserActionOptions = {},
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    reportClientError(error, {
      tags: options.tags,
      extra: options.extra,
      level: options.level,
    });
    const message =
      error instanceof Error
        ? error.message
        : options.fallbackMessage || String(error);
    options.onError?.(error, message);
    return undefined;
  }
}
