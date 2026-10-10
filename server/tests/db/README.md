# Database-level regression tests

`feedback_db.sql` asserts the post-event feedback guarantees directly against a
migrated PostgreSQL database: archived events stay eligible, the scan window bounds
the backlog, the delivery claim is single-winner, retries are bounded and never
duplicate a survey, the two wedding sides are independent, and tenant scoping
filters. Every check raises on failure, so a clean run means all green.

```bash
createdb maple_test
for d in prisma/migrations/*/; do psql -d maple_test -v ON_ERROR_STOP=1 -f "$d/migration.sql"; done
psql -d maple_test -v ON_ERROR_STOP=1 -f tests/db/feedback_db.sql
```

Concurrency (single-winner claim) is additionally verified with two simultaneous
sessions — see the audit report for the exact commands.

## EventDate tenancy

`eventdate_tenancy.sql` asserts the multi-tenancy model for calendar dates: two
tenants can hold the same day, one tenant still cannot hold a day twice, each
tenant's calendar and bookings stay isolated, and a tenant-scoped archive run does
not touch another tenant. See docs/EVENTDATE-TENANCY.md.

```bash
psql -d maple_test -v ON_ERROR_STOP=1 -f tests/db/eventdate_tenancy.sql
```

## End-to-end scenario

`e2e-feedback.js` runs the **real worker, message builders, submission semantics and
statistics module** against a migrated database: a regular event, an overnight
(19:00 → 01:00) event and a wedding with two parties, plus a second tenant. It
asserts dispatch on the following day, per-recipient emails with distinct links and
no unresolved placeholders, tenant isolation, single-use submission, independent
wedding responses, KPI values, and that a second run produces no duplicates.

```bash
createdb maple_e2e
for d in prisma/migrations/*/; do psql -d maple_e2e -v ON_ERROR_STOP=1 -f "$d/migration.sql"; done
psql -d maple_e2e -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'
TZ=Asia/Jerusalem E2E_DB=maple_e2e node tests/db/e2e-feedback.js
```

`@prisma/client` is not used by this script — the four dispatcher methods are
implemented over `psql`, so it verifies the flow and the database, not Prisma's own
query generation. Run the jest suites (`npm run test:server`) for the rest.
