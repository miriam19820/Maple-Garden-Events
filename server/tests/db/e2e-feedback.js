/**
 * End-to-end verification of the post-event feedback flow against a REAL,
 * migrated PostgreSQL database.
 *
 * What is real here: the database and its schema/constraints, the worker
 * (`processDueFeedback`) and every decision module it calls, the message builders
 * (`buildFeedbackRequestMail`), the submission semantics (the same conditional
 * UPDATE the controller runs), and the statistics module.
 *
 * What is simulated: Prisma's own object-to-SQL translation. `@prisma/client`
 * cannot run in this sandbox (its engine binary cannot be downloaded), so the
 * four methods the dispatcher uses are implemented directly over `psql`. The
 * SQL below is the SQL Prisma would generate for these `where` shapes; the
 * separate suite in server/tests/db/feedback_db.sql asserts those same semantics
 * independently.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const Module = require('module');

// Configure with env vars so this runs anywhere:
//   E2E_ROOT   repo root (default: two levels up from this file)
//   E2E_DB     database name (default maple_e2e) — must already have the migrations applied
//   PGHOST/PGPORT/PGUSER  standard libpq variables
const ROOT = process.env.E2E_ROOT || path.resolve(__dirname, '..', '..');
const DB = process.env.E2E_DB || 'maple_e2e';
const PSQL = ['-d', DB, '-t', '-A', '-q'];

function sql(query) {
  const out = execFileSync('psql', [...PSQL, '-v', 'ON_ERROR_STOP=1', '-c', query], {
    encoding: 'utf8',
  });
  return out.trim();
}
function rows(query) {
  const out = sql(`SELECT coalesce(json_agg(t), '[]') FROM (${query}) t`);
  return JSON.parse(out || '[]').map(revive);
}
function revive(row) {
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) row[k] = new Date(v);
  }
  return row;
}
const q = (v) =>
  v === null || v === undefined
    ? 'NULL'
    : v instanceof Date
      ? `'${v.toISOString()}'::timestamp`
      : typeof v === 'number'
        ? String(v)
        : typeof v === 'boolean'
          ? String(v)
          : `'${String(v).replace(/'/g, "''")}'`;

/* ------------------------------------------------------- module wiring ---- */
const stubs = new Map();
const aliases = {
  '@maple/shared/brand': path.join(ROOT, 'shared/brand/index.ts'),
  '@maple/shared/i18n': path.join(ROOT, 'shared/i18n/index.ts'),
};
stubs.set(path.join(ROOT, 'server/src/config/prisma.ts'), { __esModule: true, default: {} });
stubs.set(path.join(ROOT, 'server/src/utils/logger.ts'), {
  logger: { info() {}, warn() {}, error() {}, debug() {} },
});
stubs.set(path.join(ROOT, 'server/src/utils/realtime.ts'), { emitFeedbackUpdated() {} });
stubs.set('uuid', { v4: require('crypto').randomUUID });
// nodemailer is real here; the mailer's transport is never used because we inject
// `sendEmail`, and the email-capture step below uses nodemailer's own jsonTransport.
stubs.set('@sentry/node', { init() {}, captureException() {}, captureMessage() {} });

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (aliases[request]) return aliases[request];
  if (stubs.has(request)) return request;
  return origResolve.call(this, request, ...rest);
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (stubs.has(request)) return stubs.get(request);
  let resolved;
  try {
    resolved = Module._resolveFilename(request, parent, isMain);
  } catch {
    return origLoad.call(this, request, parent, isMain);
  }
  if (stubs.has(resolved)) return stubs.get(resolved);
  return origLoad.call(this, request, parent, isMain);
};
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'node16',
    target: 'ES2020',
    esModuleInterop: true,
    moduleResolution: 'node16',
    ignoreDeprecations: '6.0',
    skipLibCheck: true,
  },
});

const { processDueFeedback } = require(path.join(ROOT, 'server/src/utils/feedbackHelpers.ts'));
const { buildFeedbackRequestMail } = require(path.join(ROOT, 'server/src/utils/mailer.ts'));
const { buildFeedbackSides } = require(path.join(ROOT, 'server/src/utils/feedbackHelpers.ts'));
const { eventEndDateTime, feedbackDueAt } = require(path.join(ROOT, 'server/src/utils/feedbackSchedule.ts'));
const {
  aggregateFeedbackScores,
  computeDeliveryTotals,
  percentage,
} = require(path.join(ROOT, 'server/src/utils/feedbackStats.ts'));

/* --------------------------------------------- psql-backed db adapter ----- */
const BOOKING_COLS = `b.id, b."tenantId", b."eventType", b."clientAFullName", b."clientAPhone",
  b."clientAEmail", b."clientBFullName", b."clientBPhone", b."clientBEmail", b."timeOfDay",
  json_build_object('date', d.date, 'status', d.status) AS "eventDate",
  CASE WHEN f.id IS NULL THEN NULL ELSE json_build_object('eventTime', f."eventTime") END AS "eventForm"`;

function windowClause(where) {
  const w = where.eventDate.date;
  return `d.status IN ('BOOKED','ARCHIVED') AND d.date >= ${q(w.gte)} AND d.date <= ${q(w.lte)}`;
}

const db = {
  booking: {
    async findMany(args) {
      const where = args.where;
      if (args.distinct && args.distinct.includes('tenantId')) {
        return rows(
          `SELECT DISTINCT b."tenantId" FROM "Booking" b JOIN "EventDate" d ON d.id=b."calendarDateId"
             WHERE b."isOption"=false AND ${windowClause(where)}`,
        );
      }
      const pending = `(NOT EXISTS (SELECT 1 FROM "Feedback" x WHERE x."bookingId"=b.id)
        OR EXISTS (SELECT 1 FROM "Feedback" x WHERE x."bookingId"=b.id
                     AND x."isCompleted"=false AND x."lastNotifiedAt" IS NULL
                     AND x."notifyAttempts" < 5))`;
      return rows(
        `SELECT ${BOOKING_COLS} FROM "Booking" b
           JOIN "EventDate" d ON d.id=b."calendarDateId"
           LEFT JOIN "EventForm" f ON f."bookingId"=b.id
          WHERE b."tenantId"=${q(where.tenantId)} AND b."isOption"=false
            AND ${windowClause(where)} AND ${pending}`,
      ).map((r) => {
        if (r.eventDate) r.eventDate.date = new Date(r.eventDate.date);
        return r;
      });
    },
  },
  feedback: {
    async findMany(args) {
      const w = args.where;
      return rows(
        `SELECT * FROM "Feedback" WHERE "bookingId"=${q(w.bookingId)} AND "tenantId"=${q(w.tenantId)}`,
      );
    },
    async createMany(args) {
      const data = Array.isArray(args.data) ? args.data : [args.data];
      let count = 0;
      for (const d of data) {
        const res = sql(
          `INSERT INTO "Feedback"(id,"tenantId","bookingId","clientSide","clientName",token,"updatedAt")
           VALUES (gen_random_uuid()::text, ${q(d.tenantId)}, ${q(d.bookingId)}, ${q(d.clientSide)},
                   ${q(d.clientName)}, ${q(d.token)}, now())
           ON CONFLICT ("bookingId","clientSide") DO NOTHING RETURNING id`,
        );
        if (res) count++;
      }
      return { count };
    },
    async updateMany(args) {
      const w = args.where;
      const clauses = [];
      if (w.id) clauses.push(`id=${q(w.id)}`);
      if (w.token) clauses.push(`token=${q(w.token)}`);
      if (w.tenantId) clauses.push(`"tenantId"=${q(w.tenantId)}`);
      if (w.isCompleted !== undefined) clauses.push(`"isCompleted"=${q(w.isCompleted)}`);
      if (w.lastNotifiedAt === null) clauses.push(`"lastNotifiedAt" IS NULL`);
      if (w.notifyAttempts?.lt !== undefined)
        clauses.push(`"notifyAttempts" < ${q(w.notifyAttempts.lt)}`);
      if (w.OR) {
        const parts = w.OR.map((o) =>
          o.lastNotifyAttemptAt === null
            ? `"lastNotifyAttemptAt" IS NULL`
            : `"lastNotifyAttemptAt" <= ${q(o.lastNotifyAttemptAt.lte)}`,
        );
        clauses.push(`(${parts.join(' OR ')})`);
      }
      const sets = Object.entries(args.data).map(([k, v]) =>
        v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v
          ? `"${k}"="${k}" + ${v.increment}`
          : `"${k}"=${q(v)}`,
      );
      sets.push('"updatedAt"=now()');
      const out = sql(
        `WITH upd AS (UPDATE "Feedback" SET ${sets.join(', ')} WHERE ${clauses.join(' AND ')} RETURNING 1)
         SELECT count(*) FROM upd`,
      );
      return { count: Number(out) };
    },
  },
};

/* ------------------------------------------------------------- assertions - */
let pass = 0;
const fails = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    fails.push(label);
    console.log(`  \x1b[31m✗ ${label}\x1b[0m — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/* ------------------------------------------------------------------ seed -- */
function seed() {
  sql(`TRUNCATE "Feedback","Booking","EventForm","EventDate","Tenant" CASCADE`);
  sql(`INSERT INTO "Tenant"(id,name,subdomain,"updatedAt") VALUES
        ('t-a','Maple','maple',now()), ('t-b','Other venue','other',now())`);
  sql(`INSERT INTO "EventDate"(id,"tenantId",date,status) VALUES
        ('d-1','t-a','2026-09-07 12:00:00','ARCHIVED'),
        ('d-2','t-a','2026-09-06 12:00:00','ARCHIVED'),
        ('d-3','t-a','2026-09-05 12:00:00','ARCHIVED'),
        ('d-4','t-b','2026-09-04 12:00:00','ARCHIVED')`);
  const booking = (id, tenant, date, type, tod, a, b) =>
    sql(`INSERT INTO "Booking"(id,"tenantId","clientAFullName","clientAIdNumber","clientAPhone","clientAEmail",
          "clientBFullName","clientBPhone","clientBEmail","calendarDateId","eventType","timeOfDay",
          "guestCount","finalPricePortion","totalPrice","eventCode","createdBy","updatedAt","isOption")
         VALUES (${q(id)},${q(tenant)},${q(a.name)},'1',${q(a.phone)},${q(a.email)},
                 ${q(b?.name ?? null)},${q(b?.phone ?? null)},${q(b?.email ?? null)},
                 ${q(date)},${q(type)},${q(tod)},100,0,0,${q('E-' + id)},'seed',now(),false)`);

  // Scenario A — regular event, Monday 2026-09-07, ends 23:00.
  booking('b-regular', 't-a', 'd-1', 'בר מצווה', 'evening|18:00 - 23:00', {
    name: 'משפחת כהן', phone: '050-1111111', email: 'cohen@example.test',
  });
  // Scenario B — overnight event, Sunday 2026-09-06 19:00 → Monday 01:00.
  booking('b-overnight', 't-a', 'd-2', 'בר מצווה', 'evening|19:00 - 01:00', {
    name: 'משפחת לוי', phone: '050-2222222', email: 'levi@example.test',
  });
  // Scenario C — wedding with two parties, Saturday 2026-09-05.
  booking('b-wedding', 't-a', 'd-3', 'חתונה', 'evening|19:00 - 00:00',
    { name: 'חתן כהן', phone: '050-3333333', email: 'groom@example.test' },
    { name: 'כלה לוי', phone: '050-4444444', email: 'bride@example.test' });
  // Another tenant's event — must never be touched by tenant A's processing.
  booking('b-other', 't-b', 'd-4', 'בר מצווה', 'evening|18:00 - 23:00', {
    name: 'לקוח אחר', phone: '050-5555555', email: 'other@example.test',
  });
}

/* ------------------------------------------------------------------- run -- */
(async () => {
  seed();

  const outbox = [];
  const deps = {
    db,
    log: { info() {}, warn() {}, error() {} },
    emitUpdated() {},
    sendEmail: async (to, name, link) => {
      // The real message builder — exactly what a customer would receive.
      outbox.push(buildFeedbackRequestMail(to, name, link, 'he'));
      return { ok: true };
    },
    sendWhatsApp: async () => ({ sent: false, simulated: true, hasWhatsApp: true }),
  };

  console.log('\n\x1b[1mStep 1 — worker runs the morning after (Tue 2026-09-08 10:00)\x1b[0m');
  const run1 = await processDueFeedback(new Date(2026, 8, 8, 10, 0, 0), deps);
  // 4 events: tenant A's regular + overnight + wedding, plus tenant B's own event.
  check('every due event was processed (3 for tenant A + 1 for tenant B)', run1.eventsProcessed, 4);
  // 5 links: regular + overnight + both wedding sides + tenant B's single recipient.
  check('5 survey links sent (wedding counts as two)', run1.linksSent, 5);
  check('both tenants swept independently', run1.tenants, 2);
  check('no failures', run1.failedEvents, 0);

  const created = rows(`SELECT "bookingId","clientSide","lastNotifiedAt" IS NOT NULL AS sent,
                               "notifyAttempts", length(token) AS token_len
                          FROM "Feedback" ORDER BY "bookingId","clientSide"`);
  check('survey rows created for every recipient', created.length, 5);
  check('all rows marked delivered', created.every((r) => r.sent), true);
  check('one attempt each', created.every((r) => r.notifyAttempts === 1), true);
  check('tokens are UUIDs', created.every((r) => r.token_len === 36), true);
  check(
    'wedding has two independent sides',
    created.filter((r) => r.bookingId === 'b-wedding').map((r) => r.clientSide),
    ['A', 'B'],
  );
  check('tokens are unique', new Set(rows(`SELECT token FROM "Feedback"`).map((r) => r.token)).size, 5);

  console.log('\n\x1b[1mStep 2 — the emails that were actually generated\x1b[0m');
  check('one email per recipient', outbox.length, 5);
  const recipients = outbox.map((m) => m.to).sort();
  check('correct recipients, each to their own address', recipients, [
    'bride@example.test', 'cohen@example.test', 'groom@example.test',
    'levi@example.test', 'other@example.test',
  ]);
  const bad = outbox.filter((m) => /\{[A-Za-z_]\w*\}/.test(String(m.html) + String(m.text) + String(m.subject)));
  check('no unresolved placeholder in any message', bad.length, 0);
  check('every email carries its own survey link', outbox.every((m) => {
    const token = String(m.html).match(/feedback\/([0-9a-f-]{36})/)?.[1];
    return !!token && String(m.text).includes(token);
  }), true);
  const weddingMails = outbox.filter((m) => ['groom@example.test', 'bride@example.test'].includes(String(m.to)));
  const weddingTokens = weddingMails.map((m) => String(m.html).match(/feedback\/([0-9a-f-]{36})/)[1]);
  check('the two wedding parties get different links', new Set(weddingTokens).size, 2);

  console.log('\n\x1b[1mStep 3 — tenant isolation\x1b[0m');
  const crossTenant = rows(
    `SELECT f.id FROM "Feedback" f JOIN "Booking" b ON b.id=f."bookingId" WHERE f."tenantId" <> b."tenantId"`,
  );
  check('no survey row belongs to a different tenant than its booking', crossTenant.length, 0);
  check('tenant B got exactly its own single survey',
    rows(`SELECT id FROM "Feedback" WHERE "tenantId"='t-b'`).length, 1);

  console.log('\n\x1b[1mStep 4 — customers open the survey and submit\x1b[0m');
  // The exact conditional UPDATE the controller performs inside its transaction.
  const submit = (token, food, service, venue, comment) => {
    const avg = Number(((food + service + venue) / 3).toFixed(2));
    const n = sql(
      `WITH upd AS (UPDATE "Feedback" SET "foodRating"=${food},"serviceRating"=${service},
         "venueRating"=${venue},"averageScore"=${avg},comments=${q(comment)},
         "isCompleted"=true,"completedAt"=now(),"updatedAt"=now()
        WHERE token=${q(token)} AND "isCompleted"=false RETURNING 1) SELECT count(*) FROM upd`,
    );
    return Number(n);
  };
  const tokenOf = (bookingId, side) =>
    rows(`SELECT token FROM "Feedback" WHERE "bookingId"=${q(bookingId)} AND "clientSide"=${q(side)}`)[0].token;

  check('regular event: rating accepted', submit(tokenOf('b-regular', 'A'), 5, 5, 4, 'ערב מושלם'), 1);
  check('wedding side A: 5/5 accepted', submit(tokenOf('b-wedding', 'A'), 5, 5, 5, 'הכל היה מדהים'), 1);
  check('wedding side B: 2/5 with dissatisfaction detail accepted',
    submit(tokenOf('b-wedding', 'B'), 2, 2, 2, 'האוכל הגיע קר והשירות היה איטי מאוד'), 1);
  check('replaying side B is rejected (single-use)', submit(tokenOf('b-wedding', 'B'), 5, 5, 5, 'דריסה'), 0);

  const sideB = rows(`SELECT "averageScore", comments FROM "Feedback"
                       WHERE "bookingId"='b-wedding' AND "clientSide"='B'`)[0];
  const sideA = rows(`SELECT "averageScore" FROM "Feedback"
                       WHERE "bookingId"='b-wedding' AND "clientSide"='A'`)[0];
  check('side B rating persisted and not overwritten', Number(sideB.averageScore), 2);
  check('side B dissatisfaction text persisted',
    sideB.comments, 'האוכל הגיע קר והשירות היה איטי מאוד');
  check('side A response untouched by side B', Number(sideA.averageScore), 5);

  console.log('\n\x1b[1mStep 5 — statistics (events are ARCHIVED, responses must still count)\x1b[0m');
  const statRows = rows(
    `SELECT f."clientSide", f."foodRating", f."serviceRating", f."venueRating", f."averageScore",
            f."isCompleted", f."lastNotifiedAt",
            json_build_object('eventType', b."eventType",
              'eventDate', json_build_object('date', d.date)) AS booking
       FROM "Feedback" f
       JOIN "Booking" b ON b.id=f."bookingId"
       JOIN "EventDate" d ON d.id=b."calendarDateId"
      WHERE f."tenantId"='t-a' AND f."isCompleted"=true`,
  ).map((r) => ({ ...r, booking: { ...r.booking, eventDate: { date: new Date(r.booking.eventDate.date) } } }));

  const agg = aggregateFeedbackScores(statRows);
  check('3 responses counted (weddings count per side)', agg.counts.completedFeedbacks, 3);
  // (4.67 + 5 + 2) / 3 = 3.89
  check('combined average matches the hand-computed value', agg.averages.combined, 3.89);
  check('one dissatisfied response surfaced', agg.counts.lowScore, 1);
  check('two excellent responses surfaced', agg.counts.excellent, 2);
  const wedding = agg.byEventType.find((t) => t.eventType === 'חתונה');
  check('wedding breakdown averages both sides', wedding.average, 3.5);
  check('wedding breakdown counts both sides', wedding.count, 2);

  const bookingRows = rows(
    `SELECT b.id, b."eventType", b."clientAFullName", b."clientAPhone", b."clientAEmail",
            b."clientBFullName", b."clientBPhone", b."clientBEmail",
            coalesce((SELECT json_agg(json_build_object('clientSide', f."clientSide",
                        'isCompleted', f."isCompleted", 'lastNotifiedAt', f."lastNotifiedAt"))
                      FROM "Feedback" f WHERE f."bookingId"=b.id), '[]') AS feedbacks
       FROM "Booking" b WHERE b."tenantId"='t-a'`,
  );
  const totals = computeDeliveryTotals(bookingRows, (b) => buildFeedbackSides(b));
  check('4 recipients expected across the 3 events', totals.expectedSides, 4);
  check('4 surveys actually sent', totals.sentSides, 4);
  check('1 still awaiting an answer', totals.pendingFeedbacks, 1);
  check('response rate = 3/4 = 75%', percentage(agg.counts.completedFeedbacks, totals.sentSides), 75);

  console.log('\n\x1b[1mStep 6 — worker runs again: no duplicates\x1b[0m');
  const before = rows(`SELECT count(*)::int AS n FROM "Feedback"`)[0].n;
  const mailsBefore = outbox.length;
  const run2 = await processDueFeedback(new Date(2026, 8, 8, 12, 0, 0), deps);
  const after = rows(`SELECT count(*)::int AS n FROM "Feedback"`)[0].n;
  check('second run sends nothing', run2.linksSent, 0);
  check('no additional emails', outbox.length - mailsBefore, 0);
  check('no additional survey rows', after - before, 0);
  check('attempt counters unchanged',
    rows(`SELECT DISTINCT "notifyAttempts" AS n FROM "Feedback"`).map((r) => r.n), [1]);

  console.log('\n\x1b[1mStep 7 — an event that is not due yet is left alone\x1b[0m');
  sql(`INSERT INTO "EventDate"(id,"tenantId",date,status) VALUES ('d-5','t-a','2026-09-08 12:00:00','BOOKED')`);
  sql(`INSERT INTO "Booking"(id,"tenantId","clientAFullName","clientAIdNumber","clientAPhone","clientAEmail",
        "calendarDateId","eventType","timeOfDay","guestCount","finalPricePortion","totalPrice",
        "eventCode","createdBy","updatedAt","isOption")
       VALUES ('b-today','t-a','אירוע הערב','9','050-9','tonight@example.test','d-5','בר מצווה',
               'evening|18:00 - 23:00',100,0,0,'E-today','seed',now(),false)`);
  const run3 = await processDueFeedback(new Date(2026, 8, 8, 23, 30, 0), deps);
  check("tonight's event is not surveyed yet", run3.linksSent, 0);
  const run4 = await processDueFeedback(new Date(2026, 8, 9, 10, 0, 0), deps);
  check('and is surveyed the next morning', run4.linksSent, 1);


  console.log('\n\x1b[1mStep 8 — archive / feedback ordering is irrelevant (both directions)\x1b[0m');
  const archiveNow = (cutoffIso) =>
    Number(sql(`WITH upd AS (UPDATE "EventDate" SET status='ARCHIVED'
                 WHERE status='BOOKED' AND date < ${q(cutoffIso)} RETURNING 1) SELECT count(*) FROM upd`));

  // Order 1: event finishes -> archive runs -> worker runs.
  seed();
  sql(`UPDATE "EventDate" SET status='BOOKED'`);
  const archivedFirst = archiveNow(new Date(2026, 8, 8, 0, 0, 0));
  const orderArchiveFirst = await processDueFeedback(new Date(2026, 8, 8, 10, 0, 0), deps);
  const stateA = rows(`SELECT "bookingId","clientSide" FROM "Feedback" ORDER BY 1,2`);
  check('archive ran first and still archived the past dates', archivedFirst > 0, true);
  check('worker still delivered every survey after archiving', orderArchiveFirst.linksSent, 5);

  // Order 2: event finishes -> worker runs -> archive runs.
  seed();
  sql(`UPDATE "EventDate" SET status='BOOKED'`);
  const orderWorkerFirst = await processDueFeedback(new Date(2026, 8, 8, 10, 0, 0), deps);
  archiveNow(new Date(2026, 8, 8, 0, 0, 0));
  const stateB = rows(`SELECT "bookingId","clientSide" FROM "Feedback" ORDER BY 1,2`);
  check('worker-first delivered the same number of surveys', orderWorkerFirst.linksSent, 5);
  check('both orderings produce an identical final survey set',
    JSON.stringify(stateA), JSON.stringify(stateB));
  // And a second sweep after archiving still sends nothing.
  const afterBoth = await processDueFeedback(new Date(2026, 8, 8, 13, 0, 0), deps);
  check('no duplicates once archived', afterBoth.linksSent, 0);

  console.log('\n\x1b[1mStep 9 — worker recovery after downtime\x1b[0m');
  seed();
  // Three events become due while the worker is down, plus one far outside the
  // lookback window that must NOT be swept up.
  sql(`INSERT INTO "EventDate"(id,"tenantId",date,status) VALUES ('d-old','t-a','2026-06-01 12:00:00','ARCHIVED')`);
  sql(`INSERT INTO "Booking"(id,"tenantId","clientAFullName","clientAIdNumber","clientAPhone","clientAEmail",
        "calendarDateId","eventType","timeOfDay","guestCount","finalPricePortion","totalPrice",
        "eventCode","createdBy","updatedAt","isOption")
       VALUES ('b-ancient','t-a','אירוע ישן','9','050-9','ancient@example.test','d-old','בר מצווה',
               'evening|18:00 - 23:00',100,0,0,'E-ancient','seed',now(),false)`);
  const mailsBeforeRecovery = outbox.length;
  // Worker was down for three days; it restarts on the 10th.
  const recovery = await processDueFeedback(new Date(2026, 8, 10, 10, 0, 0), deps);
  check('every event that became due while the worker was down is processed', recovery.linksSent, 5);
  check('no historical mass-send beyond the lookback window',
    rows(`SELECT id FROM "Feedback" WHERE "bookingId"='b-ancient'`).length, 0);
  const recoveryAgain = await processDueFeedback(new Date(2026, 8, 10, 12, 0, 0), deps);
  check('recovery run is idempotent', recoveryAgain.linksSent, 0);
  check('exactly one email per recipient during recovery', outbox.length - mailsBeforeRecovery, 5);

  console.log('\n\x1b[1mStep 10 — two concurrent submissions of the SAME survey\x1b[0m');
  const raceToken = rows(`SELECT token FROM "Feedback" WHERE "bookingId"='b-regular' LIMIT 1`)[0].token;
  const submitSql = (score, comment) =>
    `WITH upd AS (UPDATE "Feedback" SET "foodRating"=${score},"serviceRating"=${score},
       "venueRating"=${score},"averageScore"=${score},comments=${q(comment)},
       "isCompleted"=true,"completedAt"=now(),"updatedAt"=now()
      WHERE token=${q(raceToken)} AND "isCompleted"=false RETURNING 1) SELECT count(*) FROM upd`;
  const [r1, r2] = await Promise.all([
    new Promise((resolve) => resolve(Number(sql(submitSql(5, 'ראשון'))))),
    new Promise((resolve) => resolve(Number(sql(submitSql(1, 'שני'))))),
  ]);
  check('exactly one concurrent submission is accepted', r1 + r2, 1);
  const stored = rows(`SELECT "averageScore", comments FROM "Feedback" WHERE token=${q(raceToken)}`)[0];
  check('exactly one response is persisted',
    rows(`SELECT id FROM "Feedback" WHERE token=${q(raceToken)} AND "isCompleted"=true`).length, 1);
  check('the winning response is intact (not overwritten by the loser)',
    stored.comments === 'ראשון' || stored.comments === 'שני', true);

  console.log('\n\x1b[1mStep 11 — the message a customer would actually receive\x1b[0m');
  const nodemailer = require(path.join(ROOT, 'node_modules/nodemailer'));
  const captureTransport = nodemailer.createTransport({ jsonTransport: true });
  const sampleLink = 'https://events.example.test/feedback/6f1f6b6e-0f2a-4d1e-9b6d-2f5c1a0d1234';
  const built = buildFeedbackRequestMail('customer@example.test', 'ישראל ישראלי', sampleLink, 'he');
  const captured = await captureTransport.sendMail(built);
  const envelope = JSON.parse(captured.message);
  const PLACEHOLDER = /\{[A-Za-z_]\w*\}/g;
  check('a real nodemailer transport accepted and serialized the message',
    typeof captured.messageId === 'string' && captured.messageId.length > 0, true);
  check('sender is the venue, with its brand placeholder resolved',
    /\{\w+\}/.test(String(envelope.from.name || envelope.from.address || '')), false);
  check('recipient is correct', envelope.to[0].address, 'customer@example.test');
  check('subject is present and placeholder-free',
    (String(envelope.subject).match(PLACEHOLDER) || []).length, 0);
  check('html part is placeholder-free',
    (String(envelope.html).match(PLACEHOLDER) || []).length, 0);
  check('plain-text part is placeholder-free',
    (String(envelope.text).match(PLACEHOLDER) || []).length, 0);
  check('both parts carry the survey URL',
    String(envelope.html).includes(sampleLink) && String(envelope.text).includes(sampleLink), true);
  check('the customer name is personalised', String(envelope.html).includes('ישראל'), true);
  for (const ph of ['{shortName}', '{displayName}', '{phone}', '{eventName}', '{eventDate}', '{surveyUrl}', '{name}', '{team}']) {
    check(`no literal ${ph} anywhere in the message`,
      (String(envelope.subject) + String(envelope.html) + String(envelope.text)).includes(ph), false);
  }
  console.log('    ── captured envelope ──');
  console.log('    from:    ' + JSON.stringify(envelope.from));
  console.log('    to:      ' + JSON.stringify(envelope.to));
  console.log('    subject: ' + envelope.subject);
  console.log('    text:    ' + String(envelope.text).split('\n').slice(0, 3).join(' / '));

  console.log('\n\x1b[1mStep 12 — timezone evidence\x1b[0m');
  const tzRow = rows(`SELECT current_setting('TimeZone') AS db_tz, now() AS db_now`)[0];
  const evEnd = eventEndDateTime({
    eventDate: new Date(2026, 8, 7, 12),
    booking: { timeOfDay: 'evening|19:00 - 01:00' },
  });
  const evDue = feedbackDueAt({
    eventDate: new Date(2026, 8, 7, 12),
    booking: { timeOfDay: 'evening|19:00 - 01:00' },
  });
  console.log('    process TZ env:      ' + (process.env.TZ || '(unset)'));
  console.log('    process resolved TZ: ' + Intl.DateTimeFormat().resolvedOptions().timeZone);
  console.log('    process offset:      UTC' + (-new Date().getTimezoneOffset() / 60));
  console.log('    database TimeZone:   ' + tzRow.db_tz);
  console.log('    overnight event end: ' + evEnd.toString().slice(0, 24));
  console.log('    feedback due at:     ' + evDue.toString().slice(0, 24));
  check('worker runs in the venue timezone',
    Intl.DateTimeFormat().resolvedOptions().timeZone, 'Asia/Jerusalem');
  check('overnight event ends on the FOLLOWING day at 01:00',
    [evEnd.getDate(), evEnd.getHours()], [8, 1]);
  check('and its survey is due the next morning at the send hour',
    [evDue.getDate(), evDue.getHours()], [8, 10]);

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) {
    console.log('Failures:\n  ' + fails.join('\n  '));
    process.exit(1);
  }
  console.log('\x1b[32mEND-TO-END FLOW VERIFIED\x1b[0m');
})();
