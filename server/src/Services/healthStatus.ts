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

/** DB down ⇒ overall down; any degraded ⇒ degraded; else ok. */
export function aggregateHealthStatus(checks: HealthChecks): HealthOverallStatus {
  if (checks.database.status === 'down') return 'down';
  const degraded = Object.values(checks).some((c) => c.status === 'degraded');
  return degraded ? 'degraded' : 'ok';
}

/** HTTP status for readiness: DB down → 503; otherwise 200 (even if degraded). */
export function readinessHttpStatus(status: HealthOverallStatus): number {
  return status === 'down' ? 503 : 200;
}
