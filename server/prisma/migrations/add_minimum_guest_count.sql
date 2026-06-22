ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "minimumGuestCount" INTEGER;

UPDATE "Booking"
SET "minimumGuestCount" = "guestCount"
WHERE "minimumGuestCount" IS NULL AND "guestCount" > 0;
