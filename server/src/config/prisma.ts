import { PrismaClient } from '@prisma/client';
import { withDbRetry } from '../utils/dbRetry';
import { logger } from '../utils/logger';
import { recordDbQuery } from '../utils/apmMetrics';
import { captureMessage } from './sentry';

const slowQueryMs = Number(process.env.SLOW_QUERY_MS ?? 500);

const base = new PrismaClient({
  log:
    process.env.PRISMA_LOG_QUERIES === 'true'
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ]
      : [{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }],
});

if (process.env.PRISMA_LOG_QUERIES === 'true') {
  // Typed loosely — event API varies slightly across Prisma minor versions.
  (base as unknown as { $on: (event: 'query', cb: (e: { duration: number; query: string }) => void) => void }).$on(
    'query',
    (e) => {
      if (e.duration >= slowQueryMs) {
        logger.warn('Slow Prisma query (engine event)', {
          durationMs: e.duration,
          query: e.query.slice(0, 300),
        });
      }
    },
  );
}

const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const start = Date.now();
        try {
          const result = await withDbRetry(() => query(args));
          const durationMs = Date.now() - start;
          recordDbQuery(durationMs, slowQueryMs, false);
          if (durationMs >= slowQueryMs) {
            logger.warn('Slow Prisma query', {
              model,
              operation,
              durationMs,
              thresholdMs: slowQueryMs,
            });
            captureMessage(`Slow Prisma query ${model}.${operation} (${durationMs}ms)`, 'warning', {
              model,
              operation,
              durationMs,
            });
          }
          return result;
        } catch (error) {
          const durationMs = Date.now() - start;
          recordDbQuery(durationMs, slowQueryMs, true);
          throw error;
        }
      },
    },
  },
});

export default prisma;
