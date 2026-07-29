import { HeadBucketCommand } from '@aws-sdk/client-s3';
import prisma from '../config/prisma';
import { redisClient, isRedisAvailable } from '../config/redis';
import { getS3Client } from '../utils/s3Client';
import { getApmSnapshot } from '../utils/apmMetrics';
import { getEasyCountMeta } from './easyCount';
import {
  aggregateHealthStatus,
  readinessHttpStatus as readinessStatusFromOverall,
  type HealthCheckResult,
  type HealthChecks,
  type HealthOverallStatus,
} from './healthStatus';

export type { CheckStatus, HealthCheckResult } from './healthStatus';
export { aggregateHealthStatus } from './healthStatus';

export type HealthReport = {
  status: HealthOverallStatus;
  timestamp: string;
  uptimeSec: number;
  version?: string;
  checks: HealthChecks;
  metrics?: ReturnType<typeof getApmSnapshot>;
};

const CHECK_TIMEOUT_MS = Number(process.env.HEALTH_CHECK_TIMEOUT_MS ?? 2500);

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 'database');
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkRedis(): Promise<HealthCheckResult> {
  if (!process.env.REDIS_URL?.trim()) {
    return { status: 'skipped', detail: 'REDIS_URL not set' };
  }
  const start = Date.now();
  try {
    if (!redisClient) {
      return { status: 'down', detail: 'Redis client not initialized' };
    }
    // ioredis lazyConnect: status starts as "wait"; connect() only when needed.
    if (!isRedisAvailable() && redisClient.status === 'wait') {
      await withTimeout(redisClient.connect(), 'redis-connect');
    }
    if (!isRedisAvailable() && redisClient.status !== 'ready') {
      return {
        status: 'degraded',
        latencyMs: Date.now() - start,
        detail: `Redis not ready (status=${redisClient.status})`,
      };
    }
    const pong = await withTimeout(redisClient.ping(), 'redis-ping');
    if (pong !== 'PONG') {
      return { status: 'degraded', latencyMs: Date.now() - start, detail: `unexpected ping: ${pong}` };
    }
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: 'degraded',
      latencyMs: Date.now() - start,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkS3(): Promise<HealthCheckResult> {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) {
    return { status: 'skipped', detail: 'S3_BUCKET not set' };
  }
  const start = Date.now();
  try {
    await withTimeout(getS3Client().send(new HeadBucketCommand({ Bucket: bucket })), 's3');
    return { status: 'ok', latencyMs: Date.now() - start, detail: bucket };
  } catch (error) {
    return {
      status: 'degraded',
      latencyMs: Date.now() - start,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkEmail(): HealthCheckResult {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();
  if (!user || !pass) {
    return { status: 'skipped', detail: 'EMAIL_USER/EMAIL_PASS not set' };
  }
  return { status: 'ok', detail: 'configured' };
}

function checkEasyCount(): HealthCheckResult {
  try {
    const meta = getEasyCountMeta();
    if (meta.mode === 'off') {
      return { status: 'skipped', detail: 'EasyCount mode=off' };
    }
    return { status: 'ok', detail: `${meta.mode} — ${meta.label}` };
  } catch (error) {
    return {
      status: 'degraded',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Process-only liveness (for load balancers that need a cheap probe). */
export function getLivenessReport(): { status: 'ok'; timestamp: string; uptimeSec: number } {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSec: getApmSnapshot().uptimeSec,
  };
}

/** Dependency-aware readiness / deep health. */
export async function getReadinessReport(options?: { includeMetrics?: boolean }): Promise<HealthReport> {
  const [database, redis, s3] = await Promise.all([checkDatabase(), checkRedis(), checkS3()]);
  const checks = {
    database,
    redis,
    s3,
    email: checkEmail(),
    easycount: checkEasyCount(),
  };
  const snapshot = getApmSnapshot();
  return {
    status: aggregateHealthStatus(checks),
    timestamp: new Date().toISOString(),
    uptimeSec: snapshot.uptimeSec,
    version: process.env.npm_package_version || process.env.APP_VERSION,
    checks,
    metrics: options?.includeMetrics === false ? undefined : snapshot,
  };
}

/** HTTP status for readiness: DB down → 503; otherwise 200 (even if degraded). */
export function readinessHttpStatus(report: HealthReport): number {
  return readinessStatusFromOverall(report.status);
}
