CREATE TABLE IF NOT EXISTS "EventCheckIn" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "familiesLabel" TEXT,
  "orderedPortions" INTEGER,
  "entertainerPortions" INTEGER,
  "reservePortions" INTEGER,
  "hallReceivedConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "reserveTables" JSONB,
  "specialAdditions" TEXT,
  "customerSignature" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventCheckIn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventCheckIn_bookingId_key" UNIQUE ("bookingId"),
  CONSTRAINT "EventCheckIn_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
