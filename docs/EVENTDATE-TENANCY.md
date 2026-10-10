# EventDate — multi-tenancy model

## The defect (found 2026-09-05, fixed the same day)

`EventDate.date` was declared `@unique` — **globally**, not per tenant:

```prisma
date DateTime @unique          // before
```

```sql
CREATE UNIQUE INDEX "EventDate_date_key" ON "EventDate"("date");
```

and the queries that resolve a calendar date to a row did not filter by tenant:

```ts
// Services/calendar.service.ts, bookingLifecycle.service.ts, optionDateSync.ts — before
const eventDate = await tx.eventDate.findFirst({
  where: prismaCalendarDayWhere(calendarKey),   // no tenantId
  include: { bookings: true },
});
```

Consequences in a multi-tenant deployment:

* A calendar date belonged to whichever tenant created it first. Tenant B could
  **never** hold a date tenant A already had — the insert failed on the unique index.
* Worse, an untenanted lookup **succeeded** and returned tenant A's row, so tenant B
  would lock it, read `include: { bookings: true }` (another tenant's clients), and
  attach its own booking to a row owned by tenant A.
* `getAllCalendarDates` had no tenant filter at all, so the calendar month endpoint
  returned every tenant's dates, bookings, event forms and check-ins.

The system is effectively single-tenant per deployment today, which is why this had
not been observed — but it was a hard blocker for onboarding a second tenant.

## The model now

**One calendar-date row per tenant per civil day.**

```prisma
date DateTime
@@unique([tenantId, date])
@@index([tenantId])
@@index([date])
```

* Tenant A and tenant B can both hold `2026-09-10`.
* A single tenant still cannot hold the same day twice — the "one row per day, many
  bookings via time slots" model is unchanged.
* `@@index([date])` is added because the dropped global unique index was also the
  index serving date-range scans (calendar month view, feedback sweep, archive job).

## Every EventDate access, and how it is scoped

| Location | Access | Scoping |
|---|---|---|
| `calendar.service.getAllCalendarDates` | `findMany` by date range | `tenantId` parameter, passed from `req.user.tenantId` |
| `calendar.service.lockDateForChecking` | `findFirst` by date | `tenantId` (already a parameter) |
| `calendar.service.releaseDate` | `findFirst` by date | `tenantId` parameter added |
| `calendar.service.bookEventFinal` | lookup by `dateId` | `findFirst({ id, tenantId })` |
| `calendar.service.createOption` | lookup by `dateId` | `findFirst({ id, tenantId })` |
| `calendar.service.saveOptionHold` | `findFirst` by date | `tenantId` (already a parameter) |
| `bookingLifecycle.service` (create/convert) | `findFirst` by date | `tenantId` (already in scope) |
| `optionDateSync` | `findFirst` by date | `anchor.tenantId` |
| `bookingOptions.releaseOptions` | `updateMany` by ids | `tenantId` added |
| `bookingOptions` extend deadline | `update` → `updateMany` by id | `tenantId` added |
| `eventArchive.archivePastEvents` | `findMany` + `updateMany` | optional `tenantId`; the nightly job runs across tenants by design |
| `eventArchive` retention purge | delete by collected ids | ids come from this module's own query |
| `helpers.ts`, `eventDateLock.ts`, remaining `update({ where: { id } })` | by primary key | the id always comes from a tenant-scoped read above |

**Invariant:** an `EventDate` id may only be used for a write if it was obtained from
a read that filtered by `tenantId`. Prisma's `update` requires a unique selector, so
id-keyed writes cannot carry a tenant filter directly — where the surrounding code
could not guarantee the invariant, the read that produces the id was fixed instead
(or `update` was replaced with `updateMany`, which does accept the filter).

## Migration

`20260905203000_eventdate_tenant_unique` drops the global unique, creates
`UNIQUE(tenantId, date)` and adds `INDEX(date)`.

It only **relaxes** the constraint — a global unique is strictly stronger than a
per-tenant unique — so every existing row stays valid and nothing is modified or
deleted. A pre-flight `DO $$ … $$` block aborts the migration with an explicit
message if duplicate `(tenantId, date)` pairs somehow exist, rather than failing
obscurely on index creation. Verified against a populated database: row counts for
`EventDate`, `Booking` and `Feedback` are unchanged after the upgrade.

## Applying the migration

`npm run db:migrate:deploy` runs a **bash** script (it also handles baselining an
unmanaged database), which is not available in a stock Windows PowerShell. The
direct, cross-platform equivalent is:

```powershell
cd server
npm run db:migrate:status      # what is pending
npm run db:migrate:apply       # prisma migrate deploy — applies pending migrations only
npm run db:generate            # regenerate the client after a schema change
```

`migrate deploy` never resets or drops; it applies pending migrations in order.
Both new migrations are data-safe: the feedback one only adds columns and backfills
already-delivered rows, and this one only relaxes a constraint behind a pre-flight
guard.

If `migrate status` reports the database is *not managed by Prisma Migrate*, use the
bash script (it baselines only after `migrate diff` proves the live schema matches),
or baseline manually — but only after checking that diff is empty:

```powershell
npx prisma migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script
npx prisma migrate resolve --applied 20260725215013_init
```

## Regression tests

* `server/tests/db/eventdate_tenancy.sql` — both tenants hold `2026-09-10`; a tenant
  still cannot double-book a day; each tenant's calendar returns only its own dates;
  bookings attach to their own tenant's date; no cross-tenant booking is reachable
  through the date relation; a tenant-scoped archive leaves the other tenant alone.
* `server/tests/integration/eventDateTenancy.integration.test.ts` — the same
  scenario through the **real Prisma client** against a real database. Run it with
  `npm run test:integration` (it is skipped automatically when `DATABASE_URL` is not
  a disposable test database).
