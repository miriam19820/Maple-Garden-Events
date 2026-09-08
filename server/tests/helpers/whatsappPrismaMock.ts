/**
 * Tiny in-memory Prisma double for the WhatsApp models.
 *
 * Enough to exercise real state transitions (outbox lifecycle, idempotency, status
 * ordering) without a database, so the tests assert on BEHAVIOUR rather than on which
 * mock was called. Supports only the operations the WhatsApp module actually uses.
 */

type Row = Record<string, any>;

// structuredClone (not JSON) so Date columns stay Dates, exactly as Prisma returns them.
const clone = <T>(value: T): T => (value === undefined ? value : (structuredClone(value) as T));

let sequence = 0;
const nextId = (): string => `id-${(sequence += 1)}`;

function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return (condition as Row[]).every((c) => matchesWhere(row, c));
    if (key === 'OR') return (condition as Row[]).some((c) => matchesWhere(row, c));
    if (key === 'NOT') return !matchesWhere(row, condition as Row);

    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (condition instanceof Date) return new Date(value).getTime() === condition.getTime();

    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      return Object.entries(condition).every(([op, operand]) => {
        switch (op) {
          case 'equals':
            return value === operand;
          case 'in':
            return (operand as unknown[]).includes(value);
          case 'notIn':
            return !(operand as unknown[]).includes(value);
          case 'not':
            return value !== operand;
          case 'lt':
            return new Date(value).getTime() < new Date(operand as string).getTime();
          case 'lte':
            return new Date(value).getTime() <= new Date(operand as string).getTime();
          case 'gt':
            return new Date(value).getTime() > new Date(operand as string).getTime();
          case 'gte':
            return new Date(value).getTime() >= new Date(operand as string).getTime();
          case 'contains':
            return String(value ?? '').includes(String(operand));
          default:
            return true;
        }
      });
    }

    return value === condition;
  });
}

function applyData(row: Row, data: Row): Row {
  const next = { ...row };
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      if ('increment' in value) {
        next[key] = (next[key] ?? 0) + (value as { increment: number }).increment;
        continue;
      }
      if ('decrement' in value) {
        next[key] = (next[key] ?? 0) - (value as { decrement: number }).decrement;
        continue;
      }
    }
    next[key] = value;
  }
  next.updatedAt = new Date();
  return next;
}

class UniqueConstraintError extends Error {
  code = 'P2002';
  constructor(target: string) {
    super(`Unique constraint failed on ${target}`);
  }
}

/** Compound-unique names Prisma generates, e.g. `tenantId_phoneNumber`. */
function expandUniqueWhere(where: Row): Row {
  const expanded: Row = {};
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === 'object' && key.includes('_') && !(value instanceof Date)) {
      Object.assign(expanded, value);
    } else {
      expanded[key] = value;
    }
  }
  return expanded;
}

export function createModel(
  name: string,
  uniqueKeys: string[][] = [],
  /** Mirrors the schema's @default(...) values, which Prisma applies server-side. */
  defaults: Row = {},
) {
  let rows: Row[] = [];

  const assertUnique = (candidate: Row, ignoreId?: string): void => {
    for (const keys of uniqueKeys) {
      // A unique index does not constrain rows whose key columns are null.
      if (keys.some((k) => candidate[k] === null || candidate[k] === undefined)) continue;
      const clash = rows.find(
        (row) => row.id !== ignoreId && keys.every((k) => row[k] === candidate[k]),
      );
      if (clash) throw new UniqueConstraintError(`${name}(${keys.join(',')})`);
    }
  };

  const sortRows = (list: Row[], orderBy: Row | Row[] | undefined): Row[] => {
    if (!orderBy) return list;
    const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...list].sort((a, b) => {
      for (const order of orders) {
        const [field, direction] = Object.entries(order)[0] as [string, 'asc' | 'desc'];
        const av = a[field] === null || a[field] === undefined ? 0 : new Date(a[field] as string).getTime() || String(a[field]);
        const bv = b[field] === null || b[field] === undefined ? 0 : new Date(b[field] as string).getTime() || String(b[field]);
        if (av < bv) return direction === 'asc' ? -1 : 1;
        if (av > bv) return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  return {
    /** Test helpers */
    __rows: () => rows.map(clone),
    __seed: (seed: Row[]) => {
      rows = seed.map((row) => ({
        id: row.id ?? nextId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...defaults,
        ...row,
      }));
    },
    __reset: () => {
      rows = [];
    },

    create: jest.fn(async ({ data, select }: Row) => {
      const row: Row = {
        id: data.id ?? nextId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...defaults,
        ...data,
      };
      assertUnique(row);
      rows.push(row);
      return select ? pick(row, select) : clone(row);
    }),

    findUnique: jest.fn(async ({ where, select }: Row) => {
      const expanded = expandUniqueWhere(where);
      const row = rows.find((r) => matchesWhere(r, expanded));
      if (!row) return null;
      return select ? pick(row, select) : clone(row);
    }),

    findFirst: jest.fn(async ({ where, select, orderBy }: Row = {}) => {
      const row = sortRows(rows.filter((r) => matchesWhere(r, where)), orderBy)[0];
      if (!row) return null;
      return select ? pick(row, select) : clone(row);
    }),

    findMany: jest.fn(async ({ where, select, orderBy, take, skip }: Row = {}) => {
      let list = sortRows(rows.filter((r) => matchesWhere(r, where)), orderBy);
      if (skip) list = list.slice(skip);
      if (take) list = list.slice(0, take);
      return list.map((row) => (select ? pick(row, select) : clone(row)));
    }),

    count: jest.fn(async ({ where }: Row = {}) => rows.filter((r) => matchesWhere(r, where)).length),

    update: jest.fn(async ({ where, data, select }: Row) => {
      const expanded = expandUniqueWhere(where);
      const index = rows.findIndex((r) => matchesWhere(r, expanded));
      if (index === -1) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
      const updated = applyData(rows[index], data);
      assertUnique(updated, updated.id);
      rows[index] = updated;
      return select ? pick(updated, select) : clone(updated);
    }),

    updateMany: jest.fn(async ({ where, data }: Row) => {
      let count = 0;
      rows = rows.map((row) => {
        if (!matchesWhere(row, where)) return row;
        count += 1;
        return applyData(row, data);
      });
      return { count };
    }),

    deleteMany: jest.fn(async ({ where }: Row = {}) => {
      const before = rows.length;
      rows = rows.filter((row) => !matchesWhere(row, where));
      return { count: before - rows.length };
    }),

    upsert: jest.fn(async ({ where, create, update }: Row) => {
      const expanded = expandUniqueWhere(where);
      const index = rows.findIndex((r) => matchesWhere(r, expanded));
      if (index === -1) {
        const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...defaults, ...create };
        rows.push(row);
        return clone(row);
      }
      rows[index] = applyData(rows[index], update);
      return clone(rows[index]);
    }),

    groupBy: jest.fn(async ({ by, where }: Row) => {
      const buckets = new Map<string, number>();
      for (const row of rows.filter((r) => matchesWhere(r, where))) {
        const key = by.map((field: string) => row[field]).join('|');
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      return [...buckets.entries()].map(([key, count]) => {
        const entry: Row = { _count: { _all: count } };
        key.split('|').forEach((value, i) => {
          entry[by[i]] = value;
        });
        return entry;
      });
    }),
  };
}

function pick(row: Row, select: Row): Row {
  const out: Row = {};
  for (const [key, wanted] of Object.entries(select)) {
    if (wanted === true) out[key] = clone(row[key]);
  }
  return out;
}

export const whatsAppConversation = createModel(
  'WhatsAppConversation',
  [['tenantId', 'phoneNumber']],
  { status: 'Unassigned', unreadCount: 0 },
);
export const whatsAppMessage = createModel(
  'WhatsAppMessage',
  [['tenantId', 'externalMessageId']],
  { status: 'Pending' },
);
export const whatsAppOutboxMessage = createModel(
  'WhatsAppOutboxMessage',
  [['tenantId', 'dedupeKey'], ['messageId']],
  { status: 'Pending', attempts: 0, maxAttempts: 5 },
);
export const whatsAppWebhookEvent = createModel('WhatsAppWebhookEvent', [['externalEventId']], {
  status: 'Pending',
  retryCount: 0,
});
export const whatsAppTemplate = createModel('WhatsAppTemplate', [['tenantId', 'name', 'language']], {
  language: 'he',
  category: 'UTILITY',
  metaStatus: 'Draft',
  version: 1,
});
export const whatsAppAutomationRule = createModel('WhatsAppAutomationRule', [['tenantId', 'name']], {
  actionType: 'SendWhatsAppToCustomer',
  isEnabled: false,
});
export const booking = createModel('Booking');
export const tenant = createModel('Tenant');
export const authorizedUser = createModel('AuthorizedUser');
export const systemSettings = createModel('SystemSettings');
export const whatsAppInboundMessage = createModel('WhatsAppInboundMessage', [['waMessageId']]);

const prismaMock: Record<string, unknown> = {
  whatsAppConversation,
  whatsAppMessage,
  whatsAppOutboxMessage,
  whatsAppWebhookEvent,
  whatsAppTemplate,
  whatsAppAutomationRule,
  booking,
  tenant,
  authorizedUser,
  systemSettings,
  whatsAppInboundMessage,
};

/**
 * Stand-in for the digits-only booking shortlist in findBookingForPhone.
 *
 * It reproduces the SQL's SEMANTICS (strip non-digits, suffix match) rather than
 * executing SQL. The SQL text itself is only exercised against a real Postgres by
 * the integration tests.
 */
prismaMock.$queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const sql = Array.isArray(strings) ? strings.join(' ') : String(strings);
  if (!/FROM\s+"Booking"/i.test(sql)) return [];

  const tenantId = values.find((v) => typeof v === 'string' && !String(v).startsWith('%')) as
    | string
    | undefined;
  const pattern = values.find((v) => typeof v === 'string' && String(v).startsWith('%')) as
    | string
    | undefined;
  const suffix = pattern ? pattern.slice(1) : '';
  if (!suffix) return [];

  const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

  return (booking.__rows() as Row[])
    .filter((row) => (tenantId ? row.tenantId === tenantId : true))
    .filter((row) => digits(row.clientAPhone).endsWith(suffix) || digits(row.clientBPhone).endsWith(suffix))
    .slice(0, 50)
    .map((row) => ({ id: row.id }));
});

// The outbox enlists in the caller's transaction; here the "transaction" is the store.
prismaMock.$transaction = jest.fn(async (arg: unknown) =>
  typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prismaMock) : arg,
);

export function resetWhatsAppPrismaMock(): void {
  for (const model of Object.values(prismaMock)) {
    if (model && typeof model === 'object' && '__reset' in model) {
      (model as { __reset: () => void }).__reset();
    }
  }
}

export default prismaMock;
