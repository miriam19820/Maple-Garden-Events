ALTER TABLE "SystemSettings"
  ADD COLUMN IF NOT EXISTS "paymentTemplates" JSONB,
  ADD COLUMN IF NOT EXISTS "defaultPaymentTemplateId" TEXT;

ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "paymentTemplateId" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentTermsText" TEXT;
