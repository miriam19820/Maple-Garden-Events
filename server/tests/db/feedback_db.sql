-- ============================================================================
-- Post-event feedback — database-level regression tests (real PostgreSQL).
--
-- Proves, against the actual migrated schema:
--   1. archived events remain visible to the worker's eligibility query
--   2. the scan window bounds the backlog (old events are not swept up)
--   3. the atomic delivery claim is genuinely single-winner (idempotency)
--   4. retry backoff re-opens a failed row, and a delivered row is never re-claimed
--   5. attempts are bounded
--   6. a wedding's two sides are independent, and a duplicate side is impossible
--   7. tenant scoping actually filters
-- Every check raises an exception on failure, so a clean run == all green.
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

-- Event dates. NOTE: Prisma stores the civil date at local noon, and EventDate.date
-- is UNIQUE (globally — see the "known defect" assertion below), so every event in
-- this fixture needs its own calendar day.
INSERT INTO "EventDate"(id,"tenantId",date,status) VALUES
  ('d-regular','t-a',   TIMESTAMP '2026-09-07 12:00:00','ARCHIVED'), -- Mon, archived at midnight
  ('d-overnight','t-a', TIMESTAMP '2026-09-05 12:00:00','ARCHIVED'), -- overnight 19:00 -> 01:00
  ('d-wedding','t-a',   TIMESTAMP '2026-09-06 12:00:00','ARCHIVED'), -- wedding, two sides
  ('d-old','t-a',       TIMESTAMP '2026-06-01 12:00:00','ARCHIVED'), -- far outside the scan window
  ('d-future','t-a',    TIMESTAMP '2026-09-20 12:00:00','BOOKED'),   -- not yet held
  ('d-tenantb','t-b',   TIMESTAMP '2026-09-04 12:00:00','ARCHIVED'); -- other tenant

INSERT INTO "Booking"(id,"tenantId","clientAFullName","clientAIdNumber","clientAPhone","clientAEmail",
                      "clientBFullName","clientBPhone","clientBEmail",
                      "calendarDateId","eventType","timeOfDay","guestCount","finalPricePortion",
                      "totalPrice","eventCode","createdBy","updatedAt","isOption") VALUES
  ('b-regular','t-a','משפחת כהן','111','050-1','a@example.test',NULL,NULL,NULL,
   'd-regular','בר מצווה','evening|18:00 - 23:00',100,0,0,'E-1','seed',now(),false),
  ('b-overnight','t-a','משפחת לוי','222','050-2','b@example.test',NULL,NULL,NULL,
   'd-overnight','בר מצווה','evening|19:00 - 01:00',100,0,0,'E-2','seed',now(),false),
  ('b-wedding','t-a','חתן כהן','333','050-3','groom@example.test','כלה לוי','050-4','bride@example.test',
   'd-wedding','חתונה','evening|19:00 - 00:00',300,0,0,'E-3','seed',now(),false),
  ('b-old','t-a','ישן','444','050-5','old@example.test',NULL,NULL,NULL,
   'd-old','בר מצווה','evening|18:00 - 23:00',100,0,0,'E-4','seed',now(),false),
  ('b-future','t-a','עתידי','555','050-6','fut@example.test',NULL,NULL,NULL,
   'd-future','בר מצווה','evening|18:00 - 23:00',100,0,0,'E-5','seed',now(),false),
  ('b-tenantb','t-b','לקוח של טננט ב','666','050-7','tb@example.test',NULL,NULL,NULL,
   'd-tenantb','בר מצווה','evening|18:00 - 23:00',100,0,0,'E-6','seed',now(),false);

-- ---------------------------------------------------------------------------
-- 1 + 2. Eligibility query (the SQL the Prisma worker query compiles to):
--        status IN (BOOKED, ARCHIVED), date inside the 14-day scan window,
--        tenant-scoped, no feedback rows yet.
--        "now" for this scenario = 2026-09-08 10:00 (the morning after).
-- ---------------------------------------------------------------------------
CREATE TEMP VIEW eligible_for_tenant_a AS
SELECT b.id
  FROM "Booking" b
  JOIN "EventDate" d ON d.id = b."calendarDateId"
 WHERE b."tenantId" = 't-a'
   AND b."isOption" = false
   AND d.status IN ('BOOKED','ARCHIVED')
   AND d.date >= TIMESTAMP '2026-08-25 00:00:00'   -- now - FEEDBACK_LOOKBACK_DAYS
   AND d.date <= TIMESTAMP '2026-09-08 00:00:00'   -- start of today
   AND NOT EXISTS (SELECT 1 FROM "Feedback" f WHERE f."bookingId" = b.id);

DO $$
DECLARE ids text[];
BEGIN
  SELECT array_agg(id ORDER BY id) INTO ids FROM eligible_for_tenant_a;
  PERFORM assert_eq(ids, ARRAY['b-overnight','b-regular','b-wedding'],
    '1+2: archived events are eligible; old (outside window), future and other-tenant events are not');
END $$;

-- Tenant B is isolated: same query for tenant B must return only its own booking.
DO $$
DECLARE ids text[];
BEGIN
  SELECT array_agg(b.id) INTO ids
    FROM "Booking" b JOIN "EventDate" d ON d.id = b."calendarDateId"
   WHERE b."tenantId" = 't-b' AND d.status IN ('BOOKED','ARCHIVED')
     AND d.date BETWEEN TIMESTAMP '2026-08-25 00:00:00' AND TIMESTAMP '2026-09-08 00:00:00';
  PERFORM assert_eq(ids, ARRAY['b-tenantb'], '7: tenant scoping isolates tenant B');
END $$;

-- ---------------------------------------------------------------------------
-- KNOWN DEFECT (outside the feedback flow, reported separately):
-- "EventDate_date_key" is UNIQUE on (date) alone rather than (tenantId, date),
-- so two tenants can never hold the same calendar date. This assertion pins the
-- current behaviour so the day it is fixed, this test fails and gets updated.
-- ---------------------------------------------------------------------------
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO "EventDate"(id,"tenantId",date,status)
    VALUES ('d-tenantb-clash','t-b', TIMESTAMP '2026-09-07 12:00:00','BOOKED');
  EXCEPTION WHEN unique_violation THEN blocked := true;
  END;
  PERFORM assert_eq(blocked, true,
    'KNOWN DEFECT pinned: EventDate.date is globally unique, so tenant B cannot use a date tenant A holds');
END $$;

-- ---------------------------------------------------------------------------
-- 6. Wedding: two independent recipient rows, duplicates impossible.
-- ---------------------------------------------------------------------------
INSERT INTO "Feedback"(id,"tenantId","bookingId","clientSide","clientName",token,"updatedAt") VALUES
  ('f-w-a','t-a','b-wedding','A','חתן כהן','tok-a',now()),
  ('f-w-b','t-a','b-wedding','B','כלה לוי','tok-b',now());

DO $$
DECLARE dup boolean := false;
BEGIN
  BEGIN
    INSERT INTO "Feedback"(id,"tenantId","bookingId","clientSide","clientName",token,"updatedAt")
    VALUES ('f-w-a2','t-a','b-wedding','A','חתן כהן','tok-a2',now());
  EXCEPTION WHEN unique_violation THEN dup := true;
  END;
  PERFORM assert_eq(dup, true, '6: duplicate (bookingId, clientSide) rejected by the database');
END $$;

-- Side A answers 5/5, side B answers 2/5 with dissatisfaction detail.
UPDATE "Feedback" SET "foodRating"=5,"serviceRating"=5,"venueRating"=5,"averageScore"=5,
       "isCompleted"=true,"completedAt"=now(),comments='מושלם' WHERE id='f-w-a';
UPDATE "Feedback" SET "foodRating"=2,"serviceRating"=2,"venueRating"=2,"averageScore"=2,
       "isCompleted"=true,"completedAt"=now(),comments='האוכל הגיע קר והשירות היה איטי' WHERE id='f-w-b';

DO $$
DECLARE a numeric; b numeric; cmt text;
BEGIN
  SELECT "averageScore" INTO a FROM "Feedback" WHERE id='f-w-a';
  SELECT "averageScore" INTO b FROM "Feedback" WHERE id='f-w-b';
  SELECT comments INTO cmt FROM "Feedback" WHERE id='f-w-b';
  PERFORM assert_eq(a, 5::numeric, '6: side A response intact after side B wrote');
  PERFORM assert_eq(b, 2::numeric, '6: side B response independent of side A');
  PERFORM assert_eq(cmt, 'האוכל הגיע קר והשירות היה איטי', '6: dissatisfaction detail persisted');
END $$;

-- ---------------------------------------------------------------------------
-- 3. Atomic delivery claim — single winner.
-- ---------------------------------------------------------------------------
INSERT INTO "Feedback"(id,"tenantId","bookingId","clientSide","clientName",token,"updatedAt")
VALUES ('f-reg','t-a','b-regular','A','משפחת כהן','tok-reg',now());

DO $$
DECLARE first_claim int; second_claim int;
BEGIN
  UPDATE "Feedback" SET "lastNotifyAttemptAt" = TIMESTAMP '2026-09-08 10:00:00',
                        "notifyAttempts" = "notifyAttempts" + 1
   WHERE id='f-reg' AND "tenantId"='t-a' AND "isCompleted"=false AND "lastNotifiedAt" IS NULL
     AND "notifyAttempts" < 5
     AND ("lastNotifyAttemptAt" IS NULL OR "lastNotifyAttemptAt" <= TIMESTAMP '2026-09-08 09:00:00');
  GET DIAGNOSTICS first_claim = ROW_COUNT;

  -- Second worker, same sweep instant: backoff has not elapsed → no claim.
  UPDATE "Feedback" SET "lastNotifyAttemptAt" = TIMESTAMP '2026-09-08 10:00:00',
                        "notifyAttempts" = "notifyAttempts" + 1
   WHERE id='f-reg' AND "tenantId"='t-a' AND "isCompleted"=false AND "lastNotifiedAt" IS NULL
     AND "notifyAttempts" < 5
     AND ("lastNotifyAttemptAt" IS NULL OR "lastNotifyAttemptAt" <= TIMESTAMP '2026-09-08 09:00:00');
  GET DIAGNOSTICS second_claim = ROW_COUNT;

  PERFORM assert_eq(first_claim, 1, '3: first worker claims the recipient');
  PERFORM assert_eq(second_claim, 0, '3: concurrent/duplicate worker run claims nothing');
END $$;

-- ---------------------------------------------------------------------------
-- 4. Retry after failure, and never re-claiming a delivered row.
-- ---------------------------------------------------------------------------
DO $$
DECLARE retry_claim int; delivered_claim int; attempts int;
BEGIN
  -- Delivery failed: lastNotifiedAt still NULL, error recorded.
  UPDATE "Feedback" SET "lastNotifyError"='SMTP timeout' WHERE id='f-reg';

  -- One hour later the backoff has elapsed → the row is retryable.
  UPDATE "Feedback" SET "lastNotifyAttemptAt" = TIMESTAMP '2026-09-08 11:00:00',
                        "notifyAttempts" = "notifyAttempts" + 1
   WHERE id='f-reg' AND "lastNotifiedAt" IS NULL AND "notifyAttempts" < 5
     AND ("lastNotifyAttemptAt" IS NULL OR "lastNotifyAttemptAt" <= TIMESTAMP '2026-09-08 10:00:00');
  GET DIAGNOSTICS retry_claim = ROW_COUNT;
  PERFORM assert_eq(retry_claim, 1, '4: failed delivery is retryable after backoff');

  SELECT "notifyAttempts" INTO attempts FROM "Feedback" WHERE id='f-reg';
  PERFORM assert_eq(attempts, 2, '4: attempts counted, no extra survey row created');
  PERFORM assert_eq((SELECT count(*)::int FROM "Feedback" WHERE "bookingId"='b-regular'), 1,
    '4: retry did not create a second survey');

  -- Retry succeeds.
  UPDATE "Feedback" SET "lastNotifiedAt" = TIMESTAMP '2026-09-08 11:00:05',
                        "lastEmailSent"=true, "lastNotifyError"=NULL WHERE id='f-reg';

  -- Any later sweep must not claim it again.
  UPDATE "Feedback" SET "lastNotifyAttemptAt" = TIMESTAMP '2026-09-09 10:00:00',
                        "notifyAttempts" = "notifyAttempts" + 1
   WHERE id='f-reg' AND "lastNotifiedAt" IS NULL AND "notifyAttempts" < 5
     AND ("lastNotifyAttemptAt" IS NULL OR "lastNotifyAttemptAt" <= TIMESTAMP '2026-09-09 09:00:00');
  GET DIAGNOSTICS delivered_claim = ROW_COUNT;
  PERFORM assert_eq(delivered_claim, 0, '4: a delivered recipient is never notified again');
END $$;

-- ---------------------------------------------------------------------------
-- 5. Attempts are bounded.
-- ---------------------------------------------------------------------------
DO $$
DECLARE claimed int;
BEGIN
  INSERT INTO "Feedback"(id,"tenantId","bookingId","clientSide","clientName",token,"updatedAt",
                         "notifyAttempts","lastNotifyAttemptAt")
  VALUES ('f-exhausted','t-a','b-overnight','A','משפחת לוי','tok-ex',now(),5,TIMESTAMP '2026-09-08 00:00:00');

  UPDATE "Feedback" SET "lastNotifyAttemptAt" = TIMESTAMP '2026-09-10 10:00:00',
                        "notifyAttempts" = "notifyAttempts" + 1
   WHERE id='f-exhausted' AND "lastNotifiedAt" IS NULL AND "notifyAttempts" < 5
     AND ("lastNotifyAttemptAt" IS NULL OR "lastNotifyAttemptAt" <= TIMESTAMP '2026-09-10 09:00:00');
  GET DIAGNOSTICS claimed = ROW_COUNT;
  PERFORM assert_eq(claimed, 0, '5: delivery attempts are bounded (row parked for manual re-send)');
END $$;

-- ---------------------------------------------------------------------------
-- Statistics must see responses on ARCHIVED events (the C5 regression).
-- ---------------------------------------------------------------------------
DO $$
DECLARE total int; avg_score numeric;
BEGIN
  SELECT count(*)::int, round(avg(f."averageScore")::numeric, 2) INTO total, avg_score
    FROM "Feedback" f
    JOIN "Booking" b ON b.id = f."bookingId"
    JOIN "EventDate" d ON d.id = b."calendarDateId"
   WHERE f."tenantId" = 't-a' AND f."isCompleted" = true
     AND b."isOption" = false AND d.status IN ('BOOKED','ARCHIVED');
  PERFORM assert_eq(total, 2, 'stats: both wedding responses counted on an ARCHIVED event');
  PERFORM assert_eq(avg_score, 3.50::numeric, 'stats: average of 5 and 2 is 3.50');
END $$;

SELECT 'ALL DATABASE TESTS PASSED' AS result;
