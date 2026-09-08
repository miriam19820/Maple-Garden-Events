export type CheckStatus = 'ok' | 'degraded' | 'down' | 'skipped';

export type HealthCheckResult = {
  status: CheckStatus;
  latencyMs?: number;
  detail?: string;
};

export type HealthOverallStatus = 'ok' | 'degraded' | 'down';

export type HealthChecks = {
  database: HealthCheckResult;
  redis: HealthCheckResult;
  s3: HealthCheckResult;
  email: HealthCheckResult;
  easycount: HealthCheckResult;
};

/**
 * DB down ⇒ overall down; any other dependency degraded OR down ⇒ degraded; else ok.
 *
 * `down` on a non-database dependency used to be ignored entirely (only `degraded`
 * was counted), so a hard-down dependency reported overall `ok`. That is how a
 * production server with no email credentials looked identical to a healthy one.
 * A non-DB dependency never forces 503 — the process is still serving traffic —
 * but it must move the aggregate off `ok` so monitoring can see it.
 */
export function aggregateHealthStatus(checks: HealthChecks): HealthOverallStatus {
  if (checks.database.status === 'down') return 'down';
  const impaired = Object.values(checks).some(
    (c) => c.status === 'degraded' || c.status === 'down',
  );
  return impaired ? 'degraded' : 'ok';
}

/** HTTP status for readiness: DB down → 503; otherwise 200 (even if degraded). */
export function readinessHttpStatus(status: HealthOverallStatus): number {
  return status === 'down' ? 503 : 200;
}
