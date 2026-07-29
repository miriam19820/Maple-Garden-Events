import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { captureException } from '../config/sentry';
import { logger } from '../utils/logger';
import { notifyCriticalAlert } from '../Services/criticalAlert.service';
import { AppError, shouldReportToMonitoring } from '../utils/AppError';
import { HmacVerificationError } from '../utils/hmac';
import { BookingAccessDeniedError } from '../utils/bookingAccess';
import { ForbiddenError, NotFoundError } from '../utils/httpErrors';
import { InvalidS3ObjectKeyError } from '../utils/s3Storage';
import { CheckScanError } from '../Services/checkScan.service';
import { UploadValidationError } from './uploadMiddleware';
import {
  DEFAULT_LOCALE,
  resolveLocaleFromRequest,
  resolveServerMessage,
  T,
  type ServerError,
} from '../i18n/getServerTranslation';

export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

function resolveMulterError(err: multer.MulterError): { statusCode: number; message: string } {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return { statusCode: 413, message: 'הקובץ גדול מדי.' };
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
    case 'LIMIT_FIELD_KEY':
    case 'LIMIT_FIELD_VALUE':
    case 'LIMIT_FIELD_COUNT':
    case 'LIMIT_PART_COUNT':
      return { statusCode: 400, message: 'בקשת העלאת קובץ לא תקינה.' };
    default:
      return { statusCode: 400, message: err.message || 'שגיאה בהעלאת קובץ.' };
  }
}

export const errorHandler = (err: ServerError & { code?: string }, req: Request, res: Response, _next: NextFunction) => {
  const locale = resolveLocaleFromRequest(req, DEFAULT_LOCALE);
  let statusCode = 500;
  let message: string = T.SERVER.ERROR.INTERNAL;
  let errorCode: string | undefined = typeof err?.code === 'string' ? err.code : undefined;

  if (err instanceof multer.MulterError) {
    ({ statusCode, message } = resolveMulterError(err));
    errorCode = err.code;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message || message;
    errorCode = err.code ?? errorCode;
  } else if (err instanceof HmacVerificationError) {
    statusCode = 401;
    message = 'חתימת webhook לא תקינה.';
  } else if (err instanceof BookingAccessDeniedError || err instanceof ForbiddenError) {
    statusCode = 403;
    message = err.message;
  } else if (err instanceof NotFoundError) {
    statusCode = 404;
    message = err.message;
  } else if (err instanceof UploadValidationError || err instanceof CheckScanError) {
    statusCode = err.statusCode || 400;
    message = err.message;
  } else if (err instanceof InvalidS3ObjectKeyError) {
    statusCode = 400;
    message = 'מפתח קובץ לא חוקי';
  } else if (typeof err?.statusCode === 'number') {
    statusCode = err.statusCode;
    message = err.message || message;
  } else if (err?.message) {
    message = err.message;
  }

  message = resolveServerMessage(locale, message, err?.i18nParams);

  const appContext = err instanceof AppError ? err.context : undefined;

  logger.error('Unhandled error', {
    message,
    statusCode,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    name: err?.name,
    code: errorCode,
    context: appContext,
  });

  if (shouldReportToMonitoring(err, statusCode)) {
    captureException(err, {
      statusCode,
      method: req.method,
      url: req.originalUrl,
      code: errorCode,
      ...appContext,
    });
    void notifyCriticalAlert({
      title: `HTTP ${statusCode} ${req.method} ${req.originalUrl}`,
      message: typeof message === 'string' ? message : 'Internal server error',
      severity: 'critical',
      source: 'express.errorHandler',
      context: {
        statusCode,
        method: req.method,
        url: req.originalUrl,
        code: errorCode,
        ...appContext,
      },
      error: err,
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    code: errorCode,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
