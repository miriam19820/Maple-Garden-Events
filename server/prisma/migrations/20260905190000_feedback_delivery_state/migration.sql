-- Post-event feedback: explicit delivery state.
--
-- Feedback rows are created before any message is sent, so a delivery failure can
-- be retried without ever creating a second survey or a second token. These columns
-- make the retry bounded, observable, and safe under concurrency: the worker claims
-- a row with a conditional UPDATE on (lastNotifiedAt IS NULL AND notifyAttempts < max
-- AND (lastNotifyAttemptAt IS NULL OR lastNotifyAttemptAt <= cutoff)), so two workers
-- can never both win the same recipient.

ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "notifyAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "lastNotifyAttemptAt" TIMESTAMP(3);
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "lastNotifyError" TEXT;

-- Backfill: rows that were already delivered must not look like fresh, unattempted
-- rows (otherwise the first sweep after deploy would re-send them). lastNotifiedAt
-- is the authoritative "already delivered" marker and is left untouched.
UPDATE "Feedback"
   SET "notifyAttempts" = 1,
       "lastNotifyAttemptAt" = "lastNotifiedAt"
 WHERE "lastNotifiedAt" IS NOT NULL
   AND "notifyAttempts" = 0;

-- Supports the worker's pending-delivery scan.
CREATE INDEX IF NOT EXISTS "Feedback_tenantId_isCompleted_lastNotifiedAt_idx"
    ON "Feedback"("tenantId", "isCompleted", "lastNotifiedAt");
