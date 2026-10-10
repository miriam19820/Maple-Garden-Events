/**
 * Tiny in-memory stand-in for the Prisma client, implementing only what the
 * feedback dispatcher uses. It evaluates the same `where` shapes the real client
 * receives (equality, `lt`/`lte`/`in`, `OR`) and the same `increment` update
 * operator, so the atomic-claim logic is genuinely exercised rather than stubbed.
 *
 * The corresponding SQL semantics are proven separately against real PostgreSQL
 * (see the database regression suite in the audit report).
 */

export type FakeFeedbackRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  clientSide: string;
  clientName: string | null;
  token: string;
  isCompleted: boolean;
  lastNotifiedAt: Date | null;
  lastEmailSent: boolean;
  lastWhatsappSent: boolean;
  notifyAttempts: number;
  lastNotifyAttemptAt: Date | null;
  lastNotifyError: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function valueEquals(actual: unknown, expected: unknown): boolean {
  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();
  }
  return actual === expected;
}

function compare(actual: unknown, condition: any): boolean {
  if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
    return valueEquals(actual, condition);
  }
  return Object.entries(condition).every(([op, expected]) => {
    const a = actual instanceof Date ? actual.getTime() : (actual as any);
    const b = expected instanceof Date ? expected.getTime() : (expected as any);
    switch (op) {
      case 'lt':
        return a !== null && a !== undefined && a < b;
      case 'lte':
        return a !== null && a !== undefined && a <= b;
      case 'gt':
        return a !== null && a !== undefined && a > b;
      case 'gte':
        return a !== null && a !== undefined && a >= b;
      case 'in':
        return (expected as unknown[]).includes(actual as never);
      case 'not':
        return !valueEquals(actual, expected);
      default:
        throw new Error(`fakeFeedbackDb: unsupported operator "${op}"`);
    }
  });
}

export function matchesWhere(row: Record<string, unknown>, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as any[]).some((sub) => matchesWhere(row, sub));
    }
    if (key === 'AND') {
      return (condition as any[]).every((sub) => matchesWhere(row, sub));
    }
    return compare(row[key], condition);
  });
}

function applyData(row: Record<string, unknown>, data: any): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'increment' in (value as any)) {
      row[key] = ((row[key] as number) ?? 0) + (value as any).increment;
    } else {
      row[key] = value;
    }
  }
}

let seq = 0;

export function createFakeFeedbackDb(options: {
  rows?: Partial<FakeFeedbackRow>[];
  bookings?: any[];
} = {}) {
  const rows: FakeFeedbackRow[] = (options.rows ?? []).map((row, index) => ({
    id: row.id ?? `fb-${index}`,
    tenantId: row.tenantId ?? 't-a',
    bookingId: row.bookingId ?? 'b-1',
    clientSide: row.clientSide ?? 'A',
    clientName: row.clientName ?? null,
    token: row.token ?? `tok-${index}`,
    isCompleted: row.isCompleted ?? false,
    lastNotifiedAt: row.lastNotifiedAt ?? null,
    lastEmailSent: row.lastEmailSent ?? false,
    lastWhatsappSent: row.lastWhatsappSent ?? false,
    notifyAttempts: row.notifyAttempts ?? 0,
    lastNotifyAttemptAt: row.lastNotifyAttemptAt ?? null,
    lastNotifyError: row.lastNotifyError ?? null,
  }));

  const bookingFindManyArgs: any[] = [];

  const db = {
    rows,
    bookingFindManyArgs,
    booking: {
      findMany: async (args: any) => {
        bookingFindManyArgs.push(args);
        const all = options.bookings ?? [];
        if (args?.distinct?.includes('tenantId')) {
          const seen = new Set<string>();
          return all
            .filter((b) => (seen.has(b.tenantId) ? false : (seen.add(b.tenantId), true)))
            .map((b) => ({ tenantId: b.tenantId }));
        }
        const tenantId = args?.where?.tenantId;
        return tenantId ? all.filter((b) => b.tenantId === tenantId) : all;
      },
    },
    feedback: {
      findMany: async (args: any) => rows.filter((row) => matchesWhere(row as never, args?.where)),
      createMany: async (args: any) => {
        const incoming = Array.isArray(args.data) ? args.data : [args.data];
        let count = 0;
        for (const item of incoming) {
          const clash = rows.some(
            (row) => row.bookingId === item.bookingId && row.clientSide === item.clientSide,
          );
          if (clash) {
            if (args.skipDuplicates) continue;
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
          }
          rows.push({
            id: `fb-new-${seq++}`,
            tenantId: item.tenantId,
            bookingId: item.bookingId,
            clientSide: item.clientSide,
            clientName: item.clientName ?? null,
            token: item.token,
            isCompleted: false,
            lastNotifiedAt: null,
            lastEmailSent: false,
            lastWhatsappSent: false,
            notifyAttempts: 0,
            lastNotifyAttemptAt: null,
            lastNotifyError: null,
          });
          count++;
        }
        return { count };
      },
      updateMany: async (args: any) => {
        const matched = rows.filter((row) => matchesWhere(row as never, args?.where));
        matched.forEach((row) => applyData(row as never, args.data));
        return { count: matched.length };
      },
    },
  };

  return db;
}
