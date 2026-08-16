/**
 * Lightweight in-process APM counters for ops dashboards / health summaries.
 * Not a replacement for Sentry traces or CloudWatch — complements request/DB logging.
 */

export type ApmSnapshot = {
  startedAt: string;
  uptimeSec: number;
  http: {
    requests: number;
    errors4xx: number;
    errors5xx: number;
    slowRequests: number;
  };
  db: {
    queries: number;
    slowQueries: number;
    failures: number;
  };
  alerts: {
    criticalSent: number;
  };
};

const startedAt = new Date();

const counters = {
  httpRequests: 0,
  http4xx: 0,
  http5xx: 0,
  httpSlow: 0,
  dbQueries: 0,
  dbSlow: 0,
  dbFailures: 0,
  criticalAlerts: 0,
};

export function recordHttpRequest(statusCode: number, durationMs: number, slowThresholdMs: number): void {
  counters.httpRequests += 1;
  if (statusCode >= 500) counters.http5xx += 1;
  else if (statusCode >= 400) counters.http4xx += 1;
  if (durationMs >= slowThresholdMs) counters.httpSlow += 1;
}

export function recordDbQuery(durationMs: number, slowThresholdMs: number, failed = false): void {
  counters.dbQueries += 1;
  if (failed) counters.dbFailures += 1;
  if (durationMs >= slowThresholdMs) counters.dbSlow += 1;
}

export function recordCriticalAlertSent(): void {
  counters.criticalAlerts += 1;
}

export function getApmSnapshot(): ApmSnapshot {
  return {
    startedAt: startedAt.toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    http: {
      requests: counters.httpRequests,
      errors4xx: counters.http4xx,
      errors5xx: counters.http5xx,
      slowRequests: counters.httpSlow,
    },
    db: {
      queries: counters.dbQueries,
      slowQueries: counters.dbSlow,
      failures: counters.dbFailures,
    },
    alerts: {
      criticalSent: counters.criticalAlerts,
    },
  };
}
