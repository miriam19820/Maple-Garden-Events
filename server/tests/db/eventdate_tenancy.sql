-- ============================================================================
-- EventDate multi-tenancy — database-level regression tests (real PostgreSQL).
--
-- Before the fix, "EventDate_date_key" was UNIQUE(date) — globally. A calendar
-- date belonged to whichever tenant created it first, so tenant B could not hold
-- a date tenant A already had, and an untenanted lookup by date could return
-- another tenant's row together with its bookings.
--
-- Proves, against the migrated schema:
--   1. two tenants can hold the SAME calendar date simultaneously
--   2. one tenant still cannot hold the same date twice
--   3. each tenant's calendar query returns only its own dates
--   4. each tenant's booking attaches only to its own EventDate row
--   5. neither tenant reaches the other's bookings through the EventDate relation
--   6. the archive job can be scoped to one tenant
-- ============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION assert_eq(actual anyelement, expected anyelement, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL % — expected %, got %', label, expected, actual;
  END IF;
  RAISE NOTICE 'PASS %', label;
END $$;

TRUNCATE "Feedback", "Booking", "EventDate", "Tenant" CASCADE;

INSERT INTO "Tenant"(id,name,subdomain,"updatedAt") VALUES
  ('t-a','Tenant A','a',now()), ('t-b','Tenant B','b',now());

-- ---------------------------------------------------------------------------
-- 1. The same civil date for two different tenants — the core requirement.
-- ---------------------------------------------------------------------------
INSERT INTO "EventDate"(id,"tenantId",date,status) VALUES
  ('d-a','t-a', TIMESTAMP '2026-09-10 12:00:00','BOOKED'),
  ('d-b','t-b', TIMESTAMP '2026-09-10 12:00:00','BOOKED');

DO $$
BEGIN
  PERFORM assert_eq(
    (SELECT count(*)::int FROM "EventDate" WHERE date = TIMESTAMP '2026-09-10 12:00:00'), 2,
    '1: tenant A and tenant B both hold 2026-09-10');
END $$;

-- ---------------------------------------------------------------------------
-- 2. Within one tenant the date is still unique (one calendar row per day).
-- ---------------------------------------------------------------------------
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO "EventDate"(id,"tenantId",date,status)
    VALUES ('d-a2','t-a', TIMESTAMP '2026-09-10 12:00:00','OPTION');
  EXCEPTION WHEN unique_violation THEN blocked := true;
  END;
  PERFORM assert_eq(blocked, true, '2: a tenant still cannot hold the same date twice');
END $$;

-- ---------------------------------------------------------------------------
-- 3 + 4. Bookings attach to their own tenant's date row.
-- ---------------------------------------------------------------------------
INSERT INTO "Booking"(id,"tenantId","clientAFullName","clientAIdNumber","clientAPhone","clientAEmail",
                      "calendarDateId","eventType","timeOfDay","guestCount","finalPricePortion",
                      "totalPrice","eventCode","createdBy","updatedAt","isOption") VALUES
  ('bk-a','t-a','לקוח של A','1','050-1','a@example.test','d-a','חתונה','evening|19:00 - 00:00',
   300,0,0,'E-A','seed',now(),false),
  ('bk-b','t-b','לקוח של B','2','050-2','b@example.test','d-b','בר מצווה','evening|18:00 - 23:00',
   100,0,0,'E-B','seed',now(),false);

DO $$
DECLARE a_dates text[]; b_dates text[];
BEGIN
  -- The calendar month query, now tenant-scoped.
  SELECT array_agg(id ORDER BY id) INTO a_dates FROM "EventDate"
   WHERE "tenantId"='t-a' AND date BETWEEN TIMESTAMP '2026-09-01' AND TIMESTAMP '2026-09-30';
  SELECT array_agg(id ORDER BY id) INTO b_dates FROM "EventDate"
   WHERE "tenantId"='t-b' AND date BETWEEN TIMESTAMP '2026-09-01' AND TIMESTAMP '2026-09-30';
  PERFORM assert_eq(a_dates, ARRAY['d-a'], '3: tenant A calendar returns only A');
  PERFORM assert_eq(b_dates, ARRAY['d-b'], '3: tenant B calendar returns only B');
END $$;

DO $$
DECLARE owner_a text; owner_b text;
BEGIN
  SELECT d."tenantId" INTO owner_a FROM "Booking" b JOIN "EventDate" d ON d.id=b."calendarDateId"
   WHERE b.id='bk-a';
  SELECT d."tenantId" INTO owner_b FROM "Booking" b JOIN "EventDate" d ON d.id=b."calendarDateId"
   WHERE b.id='bk-b';
  PERFORM assert_eq(owner_a, 't-a', '4: tenant A booking attaches to A''s EventDate');
  PERFORM assert_eq(owner_b, 't-b', '4: tenant B booking attaches to B''s EventDate');
END $$;

-- ---------------------------------------------------------------------------
-- 5. Neither tenant reaches the other's bookings through the date relation.
-- ---------------------------------------------------------------------------
DO $$
DECLARE leaked int;
BEGIN
  SELECT count(*)::int INTO leaked
    FROM "EventDate" d JOIN "Booking" b ON b."calendarDateId" = d.id
   WHERE d."tenantId" = 't-a' AND b."tenantId" <> 't-a';
  PERFORM assert_eq(leaked, 0, '5: no cross-tenant booking is reachable from tenant A''s dates');

  SELECT count(*)::int INTO leaked
    FROM "EventDate" d JOIN "Booking" b ON b."calendarDateId" = d.id
   WHERE d."tenantId" = 't-b' AND b."tenantId" <> 't-b';
  PERFORM assert_eq(leaked, 0, '5: no cross-tenant booking is reachable from tenant B''s dates');
END $$;

-- ---------------------------------------------------------------------------
-- 6. The archive job can be scoped to a single tenant.
-- ---------------------------------------------------------------------------
DO $$
DECLARE archived_a int; status_b text;
BEGIN
  UPDATE "EventDate" SET date = TIMESTAMP '2026-09-01 12:00:00' WHERE id='d-a';
  UPDATE "EventDate" SET date = TIMESTAMP '2026-09-02 12:00:00' WHERE id='d-b';

  WITH upd AS (
    UPDATE "EventDate" SET status='ARCHIVED'
     WHERE "tenantId"='t-a' AND status='BOOKED' AND date < TIMESTAMP '2026-09-10 00:00:00'
     RETURNING 1)
  SELECT count(*)::int INTO archived_a FROM upd;

  SELECT status INTO status_b FROM "EventDate" WHERE id='d-b';
  PERFORM assert_eq(archived_a, 1, '6: tenant-scoped archive touched tenant A''s date');
  PERFORM assert_eq(status_b, 'BOOKED', '6: tenant B''s date was left untouched');
END $$;

SELECT 'ALL EVENTDATE TENANCY TESTS PASSED' AS result;
