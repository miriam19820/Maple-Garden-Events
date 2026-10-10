-- EventDate: make a calendar date unique PER TENANT instead of globally.
--
-- Before this migration "EventDate_date_key" was UNIQUE(date), which meant a
-- calendar date belonged to whichever tenant created it first: a second tenant
-- could never hold that date, and an untenanted lookup could return another
-- tenant's row (with its bookings attached). See docs/EVENTDATE-TENANCY.md.
--
-- Data safety: this migration only RELAXES the constraint (a global unique is
-- strictly stronger than a per-tenant unique), so every existing row remains
-- valid and no row is modified or deleted. The pre-flight check below aborts the
-- migration rather than silently dropping data if the invariant is ever violated.

DO $$
DECLARE dupes int;
BEGIN
  SELECT count(*) INTO dupes
    FROM (SELECT "tenantId", date FROM "EventDate" GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION
      'Cannot create EventDate_tenantId_date_key: % (tenantId, date) pairs are duplicated. Resolve them first.', dupes;
  END IF;
END $$;

-- Replace the global unique with a tenant-scoped one.
DROP INDEX IF EXISTS "EventDate_date_key";
CREATE UNIQUE INDEX IF NOT EXISTS "EventDate_tenantId_date_key" ON "EventDate"("tenantId", "date");

-- Date-range scans (calendar month view, feedback sweep, archive job) still need
-- a date index now that the global unique index is gone.
CREATE INDEX IF NOT EXISTS "EventDate_date_idx" ON "EventDate"("date");
