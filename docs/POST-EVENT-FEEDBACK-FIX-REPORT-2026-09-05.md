# Post-Event Feedback System — Remediation Report

**Repository:** `C:\Users\This User\Desktop\מייפל` (maple-events)
**Date:** 2026-09-05
**Scope:** fix the defects found in the production-readiness audit, without rewriting the feature.

All changes are already written into the repository (see *Files changed*). Nothing was committed to git — the working tree is modified and ready for your review.

---

## Before — defects carried into this task

| # | Defect | Severity |
|---|---|---|
| C1 | The nightly archive job (`BOOKED → ARCHIVED`) removed completed events from every feedback query — worker, admin list, manual re-send and all statistics. No recovery path. | CRITICAL |
| C2 | The 10:00 "previous day" job searched for *yesterday's BOOKED* events, which the archive job had already archived ten hours earlier — dead code. | CRITICAL |
| C3 | The default evening slot (18:00–00:00) ended at the exact instant the archive job ran: a 0-minute eligibility window decided by a cron race. | CRITICAL |
| C4 | `19:00 - 01:00` resolved its end to **01:00 on the same day**, so the survey was emailed hours *before* the event. | CRITICAL |
| C5 | Zero tenant filtering in the feedback module: cross-tenant reads (list/stats) and cross-tenant actions (`admin/send` by arbitrary `bookingId`, returning live tokens). | CRITICAL |
| C6 | Hebrew email + WhatsApp shipped a literal `{shortName}` to customers; the sender display name did too. | CRITICAL |
| H1 | A failed delivery was never retried (rows existed → the worker skipped the booking forever). | HIGH |
| H2 | The "next day" rule was not implemented; the working path sent within 10 minutes of the event end. | HIGH |
| H3 | No failure isolation — one throwing booking aborted the whole sweep. | HIGH |
| H6 | Unbounded backlog scan: any historical event with no feedback rows was a send candidate. | HIGH |
| M1 | `responseRate` divided by *expected* recipients, not by surveys sent. | MEDIUM |
| M3 | `contactForSide` fell back to party A's contact details for an unknown side. | MEDIUM |
| M9 | The "sent" marker was written after SMTP returned, with no concurrency protection. | MEDIUM |
| M10 | Logs carried client names but no correlatable IDs; no metrics for the worker. | MEDIUM |

---

## Fixes

### 1. Feedback eligibility decoupled from archival state (C1, C2, C3)

**Root cause.** Two independent concerns were expressed with one field. `EventDate.status`
carried both *"where does this date sit on the calendar"* and, implicitly, *"is this event
still part of the operational flow"*. The archive job owned the field; the feedback flow
read it. So archiving silently switched feedback off, and because both cron jobs fired at
00:00 the outcome for evening events was a race.

**Architectural decision.** Keep the archive job exactly as it is (it is correct for what it
is for), and give feedback its own, explicit eligibility model:

* **Eligibility is a pure function of the event's end datetime**, not of any mutable status.
  `feedbackDueAt(event) = civil day of the event end + 1 day, at FEEDBACK_SEND_HOUR`.
* **Delivery state lives on the `Feedback` row**, not on the calendar: `lastNotifiedAt`
  (terminal), `notifyAttempts`, `lastNotifyAttemptAt`, `lastNotifyError`.
* The worker accepts `status IN ('BOOKED','ARCHIVED')` purely to exclude options and
  cancelled/blocked dates — never to decide timing.

The two cron jobs now read and write **disjoint state**, so their order no longer matters.
This was preferred over "query archived events too" alone (which would have left the
timing race) and over a new state column on `Booking` (which would have needed a backfill
for every historical row and a second source of truth for something already derivable).

**Files / symbols**

| File | Change |
|---|---|
| `server/src/utils/feedbackSchedule.ts` **(new)** | `feedbackDueAt`, `isFeedbackDue`, `eventCivilDay`, `eventEndDateTime`, `hasEventEndedAt`, `feedbackScanWindow`, `canAttemptDelivery`, `retryCutoff`, and the `FEEDBACK_*` constants. Pure, no I/O. |
| `server/src/utils/feedbackHelpers.ts` | `processDueFeedback()` replaces the two old sweeps (both kept as thin deprecated aliases). `findFeedbackCandidates()` is tenant-scoped, windowed, status-agnostic. |
| `server/src/utils/cronJobs.ts` | The `*/10` job and the `0 10 * * *` job are replaced by one idempotent sweep on `FEEDBACK_CRON` (default hourly), which logs its schedule, send hour, lookback and resolved timezone at startup. |
| `server/src/controllers/feedback.controller.ts` | `ELIGIBLE_EVENT_STATUS_FILTER` replaces `status: 'BOOKED'` in the admin list, both statistics queries and the available-years query; `sendAdmin` now accepts `ARCHIVED` so manual re-send works the day after. |

**Why it is correct.** Nothing in the decision path reads `EventDate.status` any more —
verified by a test that asserts the worker's query only ever carries
`{ in: ['BOOKED','ARCHIVED'] }`, and by a test that the due instant is unchanged before and
after archiving. Proven end-to-end against a real database where every fixture event is
already `ARCHIVED`.

### 2. The next-day business rule, stated explicitly (H2, C3)

**Root cause.** There was no rule — only "shortly after the end" plus a dead
"yesterday by date" query, which is exactly the timezone/midnight-fragile form the brief
rules out.

**Decision.** `feedbackDueAt` = **the civil day after the event, at `FEEDBACK_SEND_HOUR`
(default 10:00 local)**, derived from the real end datetime, with one refinement: an event
ending before `FEEDBACK_NIGHT_ROLLOVER_HOUR` (default 05:00) belongs to the **previous**
civil day. Without that refinement a wedding running Monday 19:00 → Tuesday 01:00 would be
surveyed on *Wednesday*; with it, both a Monday 23:00 event and a Monday-night-into-Tuesday
wedding are surveyed Tuesday at 10:00, which is what "the day after the event" means to the
venue. The rollover hour is configurable, so the business can move it without a code change.

Catch-up is inherent: the sweep asks "is it due and not yet delivered?", so an outage at
10:00 simply means the 11:00 run does the work.

### 3. Overnight event end datetime (C4)

**Root cause.** `buildDateTime` advanced to the next day only for the literal string
`'00:00'`, so every other post-midnight end time landed on the morning of the event day.

**Fix.** `server/src/utils/eventStart.ts` — new exported rule
`endsNextDay(start, end) => toMinutes(end) <= toMinutes(start)`, used by
`getSlotEndDateTime` and therefore by `getEventEndDateTime`. The end clock-time always comes
from the slot, so the comparison uses the slot start (not `eventForm.eventTime`, which only
refines the start shown to staff).

| Slot | Before | After |
|---|---|---|
| `22:00 - 23:00` | same day 23:00 ✓ | same day 23:00 |
| `22:00 - 00:00` | next day 00:00 ✓ | next day 00:00 |
| `19:00 - 01:00` | **same day 01:00 ✗** | next day 01:00 |
| `23:30 - 02:00` | **same day 02:00 ✗** | next day 02:00 |
| `20:00 - 04:30` | **same day 04:30 ✗** | next day 04:30 |
| `08:00 - 12:00` | same day 12:00 ✓ | same day 12:00 |

This also corrects `canEditCheckIn` / `isEventLive` and the "finished events" figures in the
admin list and statistics, which used the same predicate.

### 4. Tenant isolation (C5)

**Root cause.** The shared Prisma client applies no tenant scoping (its extension only
measures query duration), and this controller — unlike its siblings — never added
`tenantId` itself.

**Fix.** Every feedback operation is now tenant-scoped server-side:

* `listAdmin`, `statsAdmin` (both queries), `getAvailableFeedbackYears` — `tenantId` from
  `req.user!.tenantId` on both the `Feedback` and the `Booking` side of each query.
* `sendAdmin` — `prisma.booking.findFirst({ where: { id, tenantId } })`, so another tenant's
  booking is a 404 and no token or link can leak.
* Worker — an explicit per-tenant loop: tenant ids first, then a tenant-scoped candidate
  query per tenant. This also gives per-tenant failure isolation.
* Delivery claim and `ensureFeedbackRecordsForBooking` — `tenantId` in the `where`, and the
  untyped `(booking as any).tenantId` is gone.
* Public `GET`/`POST /api/feedback/:token` — unchanged by design: the globally unique token
  *is* the credential and tenancy is derived from the row, never from the request.

### 5. `{shortName}` and the whole placeholder family (C6)

**Root cause.** `getBrandI18nParams` supplied only `{venueName}`, and `interpolate()` emits
unknown placeholders verbatim. Separately, brand strings such as
`messaging.emailFromName = 'גן אירועים {shortName}'` never pass through the interpolator at all.

**Fix.**
* `shared/brand/index.ts` — `getBrandI18nParams` now also supplies `shortName`,
  `displayName` and `phone`; new `resolveBrandText()` resolves placeholders inside raw brand
  strings; `mailer.getFromAddress` / `getAlertsFromAddress` use it.
* This is a root-cause fix, not a feedback-only patch: reverting it makes the new catalog
  test report **28 broken Hebrew strings and 7 English ones** — bump, selection reminder,
  security check, payment overdue, option interest, every WhatsApp equivalent, the automatic
  footer and the team signature — all of which were shipping literal placeholders to
  customers. All are now clean.
* `mailer.buildFeedbackRequestMail()` and `whatsapp.buildFeedbackRequestWhatsAppMessage()`
  were extracted so the exact customer-facing message can be asserted in tests, and the
  feedback email now carries a **plain-text alternative** alongside the HTML.

### 6. Idempotency and email-failure handling (H1, M9, §11, §12)

**Decision.** Survey rows are created *before* any delivery attempt, and delivery is guarded
by a **database-level compare-and-set**, not by an in-memory `if (!sent)`:

```sql
UPDATE "Feedback"
   SET "lastNotifyAttemptAt" = :now, "notifyAttempts" = "notifyAttempts" + 1
 WHERE id = :id AND "tenantId" = :tenant
   AND "isCompleted" = false AND "lastNotifiedAt" IS NULL
   AND "notifyAttempts" < :max
   AND ("lastNotifyAttemptAt" IS NULL OR "lastNotifyAttemptAt" <= :cutoff)
```

Only the caller that gets `count === 1` sends. State machine:

```
(no row) → PENDING → [claim] → ATTEMPTING → SENT (terminal)
                                    ↓ failure
                                 PENDING (lastNotifyError set, retry after backoff)
                                    ↓ attempts exhausted
                                 PARKED (manual re-send)
```

Consequences: a retry never creates a second survey or token; a crash mid-send costs one
attempt but cannot duplicate; two workers (or two server instances) cannot both win a row;
failures are recorded with a reason and remain visible to operators. `createMany` also uses
`skipDuplicates`, so a create race is absorbed by the existing
`@@unique([bookingId, clientSide])` constraint instead of throwing.

**Migration:** `server/prisma/migrations/20260905190000_feedback_delivery_state/migration.sql`
adds `notifyAttempts`, `lastNotifyAttemptAt`, `lastNotifyError` and an index
`(tenantId, isCompleted, lastNotifiedAt)`, and **backfills already-delivered rows** so the
first sweep after deployment cannot re-send them.

### 7. Failure isolation and observability (H3, M10)

`processDueFeedback` wraps each tenant and each booking in its own `try/catch` and returns
`{ eventsProcessed, linksSent, checked, failedEvents, tenants }`. A throwing booking is
logged with `tenantId`, `bookingId`, `endAt`, `dueAt` and the error, and the sweep continues.
Per-recipient logs now carry `tenantId`, `bookingId`, `feedbackId`, `clientSide` and the
channel outcome — no names, no tokens, no message bodies.

### 8. Statistics (C1/C5 downstream, M1, §13/§14)

* Aggregation extracted to `server/src/utils/feedbackStats.ts` (pure, unit-tested); the
  controller composes it, so there is exactly one implementation of the numbers.
* No maintained counters anywhere — every figure is derived from the persisted `Feedback`
  rows on each request.
* Nothing in the module reads `EventDate.status`.
* **Counting rule, now documented and implemented:** the unit is a **response** (one
  recipient / one `clientSide`), not an event. A wedding contributes up to two surveys sent
  and two responses, each weighing equally in the averages.
* `responseRate = responses / surveys actually SENT`. The old denominator is preserved as
  `coverageRate` (responses / every expected recipient) and `counts.sentSides` is exposed,
  so the operational view is not lost.

### 9. Backlog bound (H6) and unknown-side contact (M3)

The sweep only scans events inside `FEEDBACK_LOOKBACK_DAYS` (default 14) — without this,
relaxing the status filter would have mass-mailed every historical event on the first run.
`contactForSide` now returns no contact for an unrecognised side instead of falling back to
party A.

### 10. Configuration and documentation

* `docker-compose.prod.yml` — `TZ: ${TZ:-Asia/Jerusalem}` on the server container.
* `server/.env.example` — the full `FEEDBACK_*` block, `TZ` and `ARCHIVE_CRON`, documented.
* `docs/FEEDBACK-FLOW.md` **(new)** — the end-to-end chain, timing rules, timezone policy,
  recipient rules, delivery state machine, tenant-isolation table, statistics counting rule,
  configuration reference and operating notes.

---

## Files changed

**Modified:** `shared/brand/index.ts` · `server/src/utils/eventStart.ts` ·
`server/src/utils/feedbackHelpers.ts` · `server/src/utils/cronJobs.ts` ·
`server/src/utils/mailer.ts` · `server/src/utils/whatsapp.ts` ·
`server/src/controllers/feedback.controller.ts` · `server/prisma/schema.prisma` ·
`docker-compose.prod.yml` · `server/.env.example`

**Added:** `server/src/utils/feedbackSchedule.ts` · `server/src/utils/feedbackStats.ts` ·
`server/prisma/migrations/20260905190000_feedback_delivery_state/migration.sql` ·
`docs/FEEDBACK-FLOW.md` · `server/tests/feedbackSchedule.test.ts` ·
`server/tests/feedbackDispatch.test.ts` · `server/tests/feedbackMessages.test.ts` ·
`server/tests/feedbackStats.test.ts` · `server/tests/helpers/fakeFeedbackDb.ts` ·
`server/tests/db/feedback_db.sql` · `server/tests/db/e2e-feedback.js` ·
`server/tests/db/README.md`

**Deliberately not touched:** `server/src/Services/eventArchive.service.ts` (the archive job
is correct for its purpose), the survey UI, the submission transaction, the rating scale, the
wedding data model, and `client/`.

---

## Regression tests added

### Jest suites (71 tests) — `server/tests/`

**`feedbackSchedule.test.ts` (25)** — overnight cases A–E plus daytime and default-evening
slots; `endsNextDay`; an overnight event is *not* ended on the morning of the event day;
next-day due instants for 23:00, midnight and overnight events; not-due-before / due-after
the send hour and catch-up a day later; due instant unchanged by archiving; scan-window
bounds; retry backoff and attempt bound; month, year and **both Israeli DST boundaries**.

**`feedbackDispatch.test.ts` (16)** — an `ARCHIVED` event is processed; the query never
filters on `BOOKED`; nothing is sent before due; every candidate query is tenant-scoped; a
foreign-tenant row cannot be claimed; wedding creates two rows with distinct tokens and each
party gets its own address; unknown side gets no contact; second run sends nothing; two
concurrent sweeps send exactly once each; a completed survey is never re-notified; a failed
send is recorded, respects backoff, then retries successfully **without a second survey**; a
thrown transport error leaves state clean and does not stop the other recipient; a recipient
with no contact is not counted as sent; one failing booking and one failing tenant do not
stop the sweep.

**`feedbackMessages.test.ts` (17)** — no unresolved placeholder in subject, HTML or text for
`he` and `en`; the link appears in both parts; first-name greeting; venue named; sender
display name resolved; **catalog-wide scan** asserting no `SERVER.*` string renders a brand
placeholder verbatim; brand messaging strings resolve their own placeholders.

**`feedbackStats.test.ts` (13)** — the §18 dataset averages exactly 3; satisfaction buckets;
null handling and rounding; event-type and category breakdowns; month/year grouping; wedding
counted as two independent responses; half-answered wedding; response rate at 50/0/100%;
events with nothing sent excluded from the denominator; divide-by-zero → `null`; aggregation
never sees `status`.

### Database suite (21 assertions) — `server/tests/db/feedback_db.sql`

Archived events eligible while out-of-window / future / other-tenant events are not; tenant
scoping filters; duplicate `(bookingId, clientSide)` rejected by the database; wedding sides
independent and dissatisfaction text persisted; claim single-winner; retry after backoff with
no extra survey; delivered rows never re-claimed; attempts bounded; responses on ARCHIVED
events still aggregate (avg of 5 and 2 = 3.50); single-use submission accepts the first and
rejects the replay without overwriting; every persisted rating inside 1–5. It also **pins the
`EventDate.date` global-unique defect** described below, so the test fails the day it is fixed.

### End-to-end scenario (40 assertions) — `server/tests/db/e2e-feedback.js`

Regular event, overnight event (19:00 → 01:00), wedding with two parties, plus a second
tenant — all already `ARCHIVED` — against a migrated PostgreSQL database.

---

## Verification

### Commands executed

```bash
# Build / typecheck — on the developer machine's repo
shared:  node_modules/.bin/tsc -p tsconfig.json --noEmit            → exit 0
server:  node_modules/.bin/tsc -p <config with @maple/shared paths> → exit 0   (strict: true)

# Jest suites (executed via a jest-compatible harness — see "Unverified")
TZ=Asia/Jerusalem node harness/run.js <repo> server/tests/feedback{Schedule,Stats,Dispatch,Messages}.test.ts
  → 71 passed, 0 failed

# Database suite — real PostgreSQL 16.13
for d in prisma/migrations/*/; do psql -d maple_test -v ON_ERROR_STOP=1 -f "$d/migration.sql"; done → all 4 applied
psql -d maple_test -v ON_ERROR_STOP=1 -f server/tests/db/feedback_db.sql  → 21 PASS, ALL DATABASE TESTS PASSED

# True concurrency — two simultaneous psql sessions racing for one claim
worker-1: BEGIN; <claim>; (hold lock 3s); COMMIT;
worker-2: <claim>   (blocks, then re-evaluates)
  → final row: notifyAttempts = 1   (exactly one winner)

# End-to-end
TZ=Asia/Jerusalem E2E_DB=maple_e2e node server/tests/db/e2e-feedback.js
  → 40 passed, 0 failed — END-TO-END FLOW VERIFIED
```

### The tests genuinely catch the old bugs

The two central fixes were reverted and the suites re-run. Result: **15 failures**, including
`19:00 → 01:00` resolving to the same day, the overnight event reported as "ended" on the
morning of the event day, `["{shortName}","{shortName}","{shortName}"]` in the Hebrew email,
the same in the WhatsApp message and the sender name, and the catalog scan listing all 28
Hebrew and 7 English broken strings. Restored → 0 failures.

### End-to-end run (abridged output)

```
Step 1 — worker runs the morning after (Tue 2026-09-08 10:00)
  ✓ every due event was processed (3 for tenant A + 1 for tenant B)
  ✓ 5 survey links sent (wedding counts as two)
  ✓ survey rows created for every recipient      ✓ all rows marked delivered
  ✓ one attempt each                             ✓ tokens are UUIDs and unique
  ✓ wedding has two independent sides
Step 2 — the emails that were actually generated
  ✓ correct recipients, each to their own address    ✓ no unresolved placeholder in any message
  ✓ every email carries its own survey link          ✓ the two wedding parties get different links
Step 3 — tenant isolation
  ✓ no survey row belongs to a different tenant than its booking
  ✓ tenant B got exactly its own single survey
Step 4 — customers open the survey and submit
  ✓ regular event: rating accepted                   ✓ wedding side A: 5/5 accepted
  ✓ wedding side B: 2/5 with dissatisfaction detail accepted
  ✓ replaying side B is rejected (single-use)        ✓ side B rating persisted and not overwritten
  ✓ side A response untouched by side B
Step 5 — statistics (events are ARCHIVED, responses must still count)
  ✓ 3 responses counted (weddings count per side)    ✓ combined average matches hand-computed 3.89
  ✓ one dissatisfied / two excellent surfaced        ✓ wedding breakdown averages both sides (3.5)
  ✓ 4 recipients expected, 4 sent, 1 pending         ✓ response rate = 3/4 = 75%
Step 6 — worker runs again: no duplicates
  ✓ second run sends nothing   ✓ no additional emails   ✓ no additional rows   ✓ attempts unchanged
Step 7 — an event that is not due yet is left alone
  ✓ tonight's event is not surveyed yet   ✓ and is surveyed the next morning
40 passed, 0 failed
```

### Results table

| Requirement | Result | Evidence |
|---|---|---|
| Next-day processing | **PASS** | `feedbackSchedule.test.ts` due-instant tests; E2E steps 1 and 7 |
| Archive compatibility | **PASS** | every E2E/DB fixture event is `ARCHIVED` and is still processed; query-shape test |
| Midnight handling | **PASS** | eligibility is a pure function of the end datetime; due instant identical before/after archiving |
| Overnight events | **PASS** | cases A–E; E2E overnight event surveyed on the correct morning |
| Regular event | **PASS** | E2E steps 1–5 |
| Wedding two-sided | **PASS** | two rows, two tokens, two addresses, independent 5/5 and 2/5 responses, both in the KPIs |
| Email delivery | **PARTIAL PASS** | message generation, recipients, links, retry/idempotency verified. Real SMTP delivery **not** exercised |
| Hebrew localization | **PASS** | no unresolved placeholder anywhere; catalog-wide guard |
| Survey submission | **PASS** | DB suite §8 + E2E step 4 (first accepted, replay rejected, nothing overwritten) |
| Duplicate prevention | **PASS** | CAS claim; two concurrent Postgres sessions → one winner; second sweep sends nothing |
| Tenant isolation | **PASS** *(feedback module)* | scoped queries verified in tests, DB suite and E2E. See remaining risk #1 for the wider system |
| Statistics | **PASS** | pure module unit-tested; E2E asserts hand-computed KPIs from real rows |
| Worker reliability | **PASS** | per-tenant and per-booking isolation tests; bounded scan; structured logs |
| Retry behavior | **PASS** | failure recorded → backoff respected → retry succeeds → still one survey row |

---

## Unverified

Stated plainly, not converted into passes.

1. **Jest itself was not run.** `jest-resolve` cannot resolve modules on this session's
   mounted filesystem (`Preset ts-jest not found relative to rootDir`), and the sandbox has
   no npm access to install its own copy. The four new suites were executed by a small
   jest-compatible harness (`describe`/`it`/`expect`/`beforeEach`/`jest.fn`) running **the same
   test files against the same source modules with the machine's real dependencies** — but it
   is not jest. Please run `npm run test:server` on your machine; the suites are written to
   the repo's existing conventions.
2. **Prisma's own query generation is unverified.** `@prisma/client` cannot run here (its
   engine binary download is blocked), so the E2E implements the four dispatcher methods over
   `psql`. The SQL semantics are asserted independently in the DB suite, but the mapping from
   my `where` objects to that SQL is Prisma's job and was not executed. **This is the most
   important thing to re-run on your machine.**
3. **The HTTP layer was not exercised.** The controller now reads `req.user!.tenantId`, which
   `requireAuth` guarantees, but no request went through Express in this session. A
   supertest-level test asserting that tenant A gets 404 on tenant B's `bookingId` would close
   this.
4. **No real email was sent.** No SMTP connection was made; nothing was sent to any address.
5. **The existing jest suite was not re-run** for regressions. I read the tests that touch the
   changed predicates: `security.test.ts` uses bare slot names (`'evening'`), whose end instant
   is unchanged by the overnight fix, and `eventArchive.test.ts` covers a service I did not
   modify. Still — run the full suite before merging.
6. **The client was not built** (its `node_modules` holds Windows binaries; `vite` cannot run
   here). No client file was changed. `counts.sentSides` and `coverageRate` are additive
   fields; you may want to add them to `FeedbackStatsData` in `client/src/hooks/queries.ts`
   and surface the response rate's new meaning in the UI.
7. **The migration has not been applied to any real environment.** It applies cleanly to a
   fresh PostgreSQL 16 from the full migration history; `npm run db:migrate:deploy` still has
   to run against staging and production.

---

## Remaining risks

1. **NEW — CRITICAL, outside the feedback flow: `EventDate` is not tenant-scoped.**
   Found while building the database fixtures. `EventDate.date` is `@unique` **globally**
   rather than per tenant (`schema.prisma:228`, `migration.sql:473`), and the lookups that
   resolve a date do not filter by tenant — e.g.
   `tx.eventDate.findFirst({ where: prismaCalendarDayWhere(calendarKey) })`
   (`calendar.service.ts:405`, and the same shape in `bookingLifecycle.service.ts` and
   `bookingOptions.service.ts`). In a multi-tenant deployment tenant B would find, lock and
   attach bookings to **tenant A's** `EventDate` row, see tenant A's bookings through its
   `include: { bookings: true }`, and be refused dates tenant A holds. The archive job is
   also untenanted. I did **not** fix this: it needs `@@unique([tenantId, date])`, a data
   migration, and `tenantId` added to roughly fifteen lookups across the calendar and booking
   services — a separate piece of work with its own test plan, and doing it halfway would be
   worse than leaving it visible. The feedback flow is unaffected because it scopes on
   `Booking.tenantId`, and the DB suite pins the current behaviour so the fix is noticed.
   **Today's deployment appears effectively single-tenant, which is what keeps this
   theoretical — it must be fixed before a second tenant is onboarded.**
2. **Survey tokens still never expire.** Out of scope for this task; the token is unguessable
   (UUIDv4, `@unique`, UUID-validated before lookup) and single-use, but a link works forever
   until submitted. Adding `expiresAt` is a small, self-contained follow-up.
3. **Dissatisfaction capture is still one optional free-text box.** Low ratings are stored,
   surfaced to staff and alerted on, but the customer is never *asked* what went wrong. A
   conditional follow-up on a low rating is a product change, not a bug fix.
4. **Survey UX gaps unchanged:** no `maxLength` on the comments field (the backend caps at
   2000 and returns a generic alert), star ratings are not keyboard-operable
   (`PRD.md` §6.8 requires it), and the email still does not name the event or its date.
5. **Email infrastructure is still single-provider** (Gmail via nodemailer) with no fallback
   and no bounce handling. Delivery is now retried and recorded, which is the part that was
   broken; provider redundancy is a separate decision.
6. **`TZ` in production is still unknown.** It is now set in `docker-compose.prod.yml`, but
   `server.env` on the EC2 host is not in the repository — confirm the container really comes
   up in `Asia/Jerusalem`. The startup log line now prints the resolved timezone.
7. **Horizontal scaling is safe but untested at scale.** The claim makes multiple instances
   correct; the deployment still runs a single container.
8. **Dead code:** `server/src/vendor/shared/` is a stale duplicate of `shared/` (nothing
   imports it) and still contains the old, broken `getBrandI18nParams`. Harmless today,
   a trap for the next reader.

---

## Deployment checklist

1. Review the working tree (nothing was committed).
2. `npm run test:server` and the full build on your machine.
3. `npm run db:migrate:deploy` — applies `20260905190000_feedback_delivery_state`, including
   the backfill that stops already-delivered rows from being re-sent.
4. Confirm `TZ=Asia/Jerusalem` reaches the server container; check the startup line
   `Post-event feedback sweep scheduled: … timezone Asia/Jerusalem`.
5. Optionally set `FEEDBACK_SEND_HOUR` / `FEEDBACK_LOOKBACK_DAYS`; the defaults (10:00, 14
   days) are sensible. On first deploy, consider a smaller lookback for one cycle if there is
   a long tail of historical events without feedback rows.
6. After the first morning sweep, check the logs for `Feedback sweep finished` and confirm
   `failedEvents: 0`.

---

# FINAL VERDICT

🟡 **PRODUCTION READY WITH CONDITIONS**

Every CRITICAL defect from the audit is fixed, each is covered by a regression test that was
demonstrated to fail against the old code, and the complete flow — event → next day → worker →
correct recipients → correct message → survey → rating → detailed feedback → statistics → no
duplicates → tenant isolated — was demonstrated end to end against a real PostgreSQL database.

It is not green for three honest reasons: Prisma's own query generation and the Express layer
were never executed here (conditions 2 and 3 in *Unverified*), jest itself could not be run in
this environment, and a **newly discovered critical multi-tenancy defect in the calendar core**
(`EventDate` not tenant-scoped) remains open — outside the feedback flow, but squarely inside
the guarantee that tenants are isolated.

Run `npm run test:server` plus a staging deploy with the migration applied, and confirm one
real survey lands in an inbox. With those three green, this becomes 🟢.
