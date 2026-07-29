import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { recordHttpRequest } from '../utils/apmMetrics';
import { captureMessage } from '../config/sentry';

const slowRequestMs = Number(process.env.SLOW_REQUEST_MS ?? 2000);

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const entry = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs,
      ip: req.ip,
    };

    recordHttpRequest(res.statusCode, durationMs, slowRequestMs);

    // Skip noisy liveness probes from info logs
    const isHealth =
      req.originalUrl === '/api/health/live' ||
      req.originalUrl === '/api/health' ||
      req.originalUrl.startsWith('/api/health?');

    if (res.statusCode >= 500) {
      logger.error('HTTP request failed', entry);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP client error', entry);
    } else if (durationMs >= slowRequestMs) {
      logger.warn('Slow HTTP request', { ...entry, thresholdMs: slowRequestMs });
      captureMessage(`Slow HTTP ${req.method} ${req.originalUrl} (${durationMs}ms)`, 'warning', entry);
    } else if (!isHealth) {
      logger.info('HTTP request', entry);
    }
  });

  next();
}
