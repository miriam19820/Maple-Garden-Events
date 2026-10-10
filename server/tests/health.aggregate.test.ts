import {
  aggregateHealthStatus,
  readinessHttpStatus,
  type HealthCheckResult,
  type HealthChecks,
} from '../src/Services/healthStatus';

function check(status: HealthCheckResult['status'], detail?: string): HealthCheckResult {
  return { status, detail };
}

function checks(partial: Partial<HealthChecks>): HealthChecks {
  return {
    database: check('ok'),
    redis: check('skipped'),
    s3: check('skipped'),
    email: check('skipped'),
    easycount: check('skipped'),
    ...partial,
  };
}

describe('health aggregation', () => {
  it('returns ok when database is healthy and others skipped/ok', () => {
    expect(aggregateHealthStatus(checks({}))).toBe('ok');
    expect(aggregateHealthStatus(checks({ redis: check('ok'), s3: check('ok') }))).toBe('ok');
  });

  it('returns down when database is down', () => {
    expect(aggregateHealthStatus(checks({ database: check('down', 'timeout') }))).toBe('down');
  });

  it('returns degraded when a non-DB dependency is degraded', () => {
    expect(aggregateHealthStatus(checks({ redis: check('degraded', 'not ready') }))).toBe('degraded');
    expect(aggregateHealthStatus(checks({ s3: check('degraded') }))).toBe('degraded');
  });

  it('returns degraded when a non-DB dependency is down, not ok', () => {
    // Regression: only 'degraded' used to be counted, so a hard-down dependency —
    // e.g. a production server with no email credentials — reported overall 'ok'.
    expect(aggregateHealthStatus(checks({ email: check('down', 'not configured') }))).toBe('degraded');
    expect(aggregateHealthStatus(checks({ s3: check('down') }))).toBe('degraded');
    expect(readinessHttpStatus(aggregateHealthStatus(checks({ email: check('down') })))).toBe(200);
  });

  it('maps readiness HTTP status from overall status', () => {
    expect(readinessHttpStatus('ok')).toBe(200);
    expect(readinessHttpStatus('degraded')).toBe(200);
    expect(readinessHttpStatus('down')).toBe(503);
  });
});
