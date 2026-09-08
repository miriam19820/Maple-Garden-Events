# WhatsApp Integration — Architecture

## Where it lives

The integration is a module inside the existing Express/Prisma server. It reuses the
platform's infrastructure rather than introducing a parallel one.

```
server/src/
├── config/whatsapp.config.ts          strongly-typed configuration
├── Services/whatsapp/
│   ├── types.ts                       status vocabularies + IWhatsAppProvider
│   ├── errors.ts                      error codes + retry classification
│   ├── phone.ts                       IPhoneNumberNormalizer
│   ├── providers/
│   │   ├── metaProvider.ts            Meta Graph API (the only file that knows Meta's wire format)
│   │   ├── fakeProvider.ts            deterministic in-memory provider (dev/tests)
│   │   └── index.ts                   provider resolution
│   ├── send.service.ts                queueWhatsAppMessage — the one send seam
│   ├── outbox.service.ts              enqueue / claim / retry state
│   ├── outboxWorker.ts                drains the outbox
│   ├── conversation.service.ts        threads + customer matching
│   ├── message.service.ts             message ledger + delivery status
│   ├── webhookEvent.service.ts        envelope parsing + idempotency gate
│   ├── webhookProcessor.ts            turns stored events into domain effects
│   ├── template.service.ts            local template registry (Meta owns approval)
│   ├── automation/                    trigger → conditions → action
│   ├── metrics.ts                     counters
│   └── health.ts                      secret-free health snapshot
├── controllers/whatsapp.controller.ts + whatsappWebhook.controller.ts
├── routes/whatsapp.routes.ts          + whatsappWebhook.routes.ts
├── validators/whatsapp.validator.ts   zod schemas
└── utils/whatsappCronJobs.ts          worker registration on node-cron
```

## Reused, not rebuilt

| Concern | Reused |
| --- | --- |
| ORM / DB | Prisma (`config/prisma.ts`, with its retry + slow-query extension) |
| Background work | `node-cron` via `utils/cronJobs.ts` |
| Auth | `middlewares/auth.ts` — role and tenant come from the DB, never the JWT |
| Authorization | `config/rbac.ts`, extended with `WHATSAPP_*` role groups |
| Errors | `utils/AppError.ts`; `WhatsAppError extends AppError` |
| Logging | `utils/logger.ts` (winston) |
| Monitoring | `utils/reportUnexpectedError.ts`, `Services/criticalAlert.service.ts` |
| Metrics | in-process counters, same style as `utils/apmMetrics.ts` |
| Validation | `middlewares/validate.ts` + zod |
| Pagination | `utils/pagination.ts` |
| Multi-tenancy | the existing `Tenant` model and `tenantId` column convention |

Nothing in the existing notification, cron, audit or auth infrastructure was replaced.

## Outbound flow

```
Business transaction (e.g. contract signed)
        │
        ▼
queueWhatsAppMessage()          validate phone · check template approval · check 24h window
        │
        ▼
WhatsAppMessage (Pending) + WhatsAppOutboxMessage (Pending)   ← same DB transaction
        │
        ▼  (transaction commits)
WhatsApp outbox worker (cron, every minute)
        │  claim: UPDATE ... WHERE id = ? AND status = 'Pending'   ← exactly one winner
        ▼
IWhatsAppProvider.sendAsync()
        │
        ├── ok       → Outbox: Sent      · Message: Sent + externalMessageId
        ├── retryable → Outbox: Pending  · nextAttemptAt = now + backoff
        └── permanent → Outbox: Failed   · Message: Failed
```

The outbox row and the business change commit together. A rolled-back transaction can
never leave a message already delivered, and a delivered message can never be lost.

## Inbound flow

```
Meta ──▶ POST /api/webhooks/whatsapp
            │
            ├── express.raw  →  X-Hub-Signature-256 verification
            ├── parseWebhookEnvelope  →  flat, individually-keyed items
            ├── persistWebhookEvent   →  UNIQUE(externalEventId) is the idempotency gate
            │        └── duplicate? stop here, no side effects
            ├── processWebhookItem    (inline, or deferred to the worker)
            └── 200 OK
                     │
                     ▼
        message  → conversation + WhatsAppMessage + runTrigger('IncomingMessage')
        status   → applyStatusUpdate() matched on externalMessageId only
        template → syncTemplateMetaStatus()
```

## Automation

```
Trigger ──▶ registry.runTrigger(trigger, context)
              │
              ├── load ENABLED WhatsAppAutomationRule rows for (trigger, tenant)
              └── for each rule → its registered handler
                                     │
                                     ├── evaluate conditions (from rule.triggerConfiguration)
                                     └── queueWhatsAppMessage(...) with a stable dedupeKey
```

There is no worker per reminder type. Adding "remind about the music selection 21 days
out" is a rule row, not code.

## Key invariants

1. **The provider is only ever reached from the outbox worker.** Nothing else calls Meta.
2. **Every query is filtered by `tenantId`** taken from the authenticated session.
3. **Delivery status is matched on `externalMessageId` only** — never on phone numbers.
4. **A local template row is not permission to send.** `metaStatus` must be `Approved`.
5. **Retries are bounded.** Permanent errors fail immediately; transient ones get a
   capped, jittered backoff and a hard attempt limit.
