/**
 * Standard operational vs unexpected error for Express + monitoring.
 * Operational (isOperational=true, typically 4xx): expected business failures — no Sentry/alert.
 * Unexpected (isOperational=false or HTTP ≥500 without AppError): bugs/infra — Sentry + alerts.
 */

export type AppErrorOptions = {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  context?: Record<string, unknown>;
  cause?: unknown;
};

export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly isOperational: boolean;
  readonly context?: Record<string, unknown>;

  constructor(message: string, options: AppErrorOptions = {}) {
    const { cause, ...rest } = options;
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'AppError';
    this.statusCode = rest.statusCode ?? 500;
    this.code = rest.code;
    this.isOperational = rest.isOperational ?? true;
    this.context = rest.context;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, code = 'BAD_REQUEST', context?: Record<string, unknown>): AppError {
    return new AppError(message, { statusCode: 400, code, isOperational: true, context });
  }

  static unauthorized(message: string, code = 'UNAUTHORIZED', context?: Record<string, unknown>): AppError {
    return new AppError(message, { statusCode: 401, code, isOperational: true, context });
  }

  static forbidden(message: string, code = 'FORBIDDEN', context?: Record<string, unknown>): AppError {
    return new AppError(message, { statusCode: 403, code, isOperational: true, context });
  }

  static notFound(message: string, code = 'NOT_FOUND', context?: Record<string, unknown>): AppError {
    return new AppError(message, { statusCode: 404, code, isOperational: true, context });
  }

  /** Programming / infra failure — always report to monitoring. */
  static internal(message: string, options?: Omit<AppErrorOptions, 'statusCode' | 'isOperational'>): AppError {
    return new AppError(message, {
      statusCode: 500,
      code: options?.code ?? 'INTERNAL',
      isOperational: false,
      context: options?.context,
      cause: options?.cause,
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** True for expected client/business failures that should not page on-call. */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) return error.isOperational;
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = Number((error as { statusCode: unknown }).statusCode);
    if (Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 500) return true;
  }
  return false;
}

/** Whether Express errorHandler should send Sentry + critical alerts. */
export function shouldReportToMonitoring(error: unknown, statusCode: number): boolean {
  if (error instanceof AppError) {
    return !error.isOperational || statusCode >= 500;
  }
  return statusCode >= 500;
}
