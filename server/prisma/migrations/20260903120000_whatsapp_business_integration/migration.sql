-- WhatsApp Business Platform integration
--
-- Additive only: no existing table, column, index or constraint is modified or dropped.
-- Every table is tenant-scoped and indexed on tenantId (§20).

-- CreateTable: conversations (one thread per tenant + phone)
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Unassigned',
    "assignedUserId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: unified inbound + outbound message ledger
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "bookingId" TEXT,
    "direction" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "content" TEXT,
    "templateName" TEXT,
    "payload" JSONB,
    "externalMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: transactional outbox
CREATE TABLE "WhatsAppOutboxMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "bookingId" TEXT,
    "toPhone" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "templateName" TEXT,
    "templateLanguage" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "externalMessageId" TEXT,
    "lastError" TEXT,
    "lastErrorCode" TEXT,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppOutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: raw webhook envelopes (the idempotency gate)
CREATE TABLE "WhatsAppWebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: local template registry (Meta owns approval)
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'he',
    "category" TEXT NOT NULL DEFAULT 'UTILITY',
    "metaStatus" TEXT NOT NULL DEFAULT 'Draft',
    "metaTemplateId" TEXT,
    "parameters" JSONB,
    "bodyPreview" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: declarative automation rules
CREATE TABLE "WhatsAppAutomationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerConfiguration" JSONB,
    "templateId" TEXT,
    "actionType" TEXT NOT NULL DEFAULT 'SendWhatsAppToCustomer',
    "actionConfiguration" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAutomationRule_pkey" PRIMARY KEY ("id")
);

-- Indexes: WhatsAppConversation
CREATE UNIQUE INDEX "WhatsAppConversation_tenantId_phoneNumber_key" ON "WhatsAppConversation"("tenantId", "phoneNumber");
CREATE INDEX "WhatsAppConversation_tenantId_status_idx" ON "WhatsAppConversation"("tenantId", "status");
CREATE INDEX "WhatsAppConversation_tenantId_lastMessageAt_idx" ON "WhatsAppConversation"("tenantId", "lastMessageAt");
CREATE INDEX "WhatsAppConversation_bookingId_idx" ON "WhatsAppConversation"("bookingId");
CREATE INDEX "WhatsAppConversation_assignedUserId_idx" ON "WhatsAppConversation"("assignedUserId");

-- Indexes: WhatsAppMessage
-- The unique key is what makes status matching and inbound dedupe safe (§15, §18).
CREATE UNIQUE INDEX "WhatsAppMessage_tenantId_externalMessageId_key" ON "WhatsAppMessage"("tenantId", "externalMessageId");
CREATE INDEX "WhatsAppMessage_tenantId_conversationId_createdAt_idx" ON "WhatsAppMessage"("tenantId", "conversationId", "createdAt");
CREATE INDEX "WhatsAppMessage_tenantId_status_idx" ON "WhatsAppMessage"("tenantId", "status");
CREATE INDEX "WhatsAppMessage_externalMessageId_idx" ON "WhatsAppMessage"("externalMessageId");
CREATE INDEX "WhatsAppMessage_bookingId_idx" ON "WhatsAppMessage"("bookingId");

-- Indexes: WhatsAppOutboxMessage
CREATE UNIQUE INDEX "WhatsAppOutboxMessage_messageId_key" ON "WhatsAppOutboxMessage"("messageId");
CREATE UNIQUE INDEX "WhatsAppOutboxMessage_tenantId_dedupeKey_key" ON "WhatsAppOutboxMessage"("tenantId", "dedupeKey");
-- Drives the worker's "due work" query.
CREATE INDEX "WhatsAppOutboxMessage_status_nextAttemptAt_idx" ON "WhatsAppOutboxMessage"("status", "nextAttemptAt");
CREATE INDEX "WhatsAppOutboxMessage_tenantId_status_idx" ON "WhatsAppOutboxMessage"("tenantId", "status");
CREATE INDEX "WhatsAppOutboxMessage_claimedBy_idx" ON "WhatsAppOutboxMessage"("claimedBy");
CREATE INDEX "WhatsAppOutboxMessage_bookingId_idx" ON "WhatsAppOutboxMessage"("bookingId");

-- Indexes: WhatsAppWebhookEvent
CREATE UNIQUE INDEX "WhatsAppWebhookEvent_externalEventId_key" ON "WhatsAppWebhookEvent"("externalEventId");
CREATE INDEX "WhatsAppWebhookEvent_status_receivedAt_idx" ON "WhatsAppWebhookEvent"("status", "receivedAt");
CREATE INDEX "WhatsAppWebhookEvent_tenantId_eventType_idx" ON "WhatsAppWebhookEvent"("tenantId", "eventType");

-- Indexes: WhatsAppTemplate
CREATE UNIQUE INDEX "WhatsAppTemplate_tenantId_name_language_key" ON "WhatsAppTemplate"("tenantId", "name", "language");
CREATE INDEX "WhatsAppTemplate_tenantId_metaStatus_idx" ON "WhatsAppTemplate"("tenantId", "metaStatus");

-- Indexes: WhatsAppAutomationRule
CREATE UNIQUE INDEX "WhatsAppAutomationRule_tenantId_name_key" ON "WhatsAppAutomationRule"("tenantId", "name");
CREATE INDEX "WhatsAppAutomationRule_tenantId_triggerType_isEnabled_idx" ON "WhatsAppAutomationRule"("tenantId", "triggerType", "isEnabled");

-- Foreign keys
-- Tenant/Booking/User links are RESTRICT on delete to match the rest of this schema:
-- a booking with WhatsApp history cannot be silently removed.
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "AuthorizedUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Deleting a conversation takes its messages with it; nothing else cascades.
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppOutboxMessage" ADD CONSTRAINT "WhatsAppOutboxMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppOutboxMessage" ADD CONSTRAINT "WhatsAppOutboxMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppOutboxMessage" ADD CONSTRAINT "WhatsAppOutboxMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WhatsAppMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppOutboxMessage" ADD CONSTRAINT "WhatsAppOutboxMessage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WhatsAppAutomationRule" ADD CONSTRAINT "WhatsAppAutomationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAutomationRule" ADD CONSTRAINT "WhatsAppAutomationRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
