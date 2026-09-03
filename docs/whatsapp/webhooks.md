# Webhooks

Endpoint: `/api/webhooks/whatsapp`, mounted **before** `express.json` so the raw body is
available for signature verification.

## GET — verification

Meta sends `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`. If the token matches
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, the challenge is echoed with 200; otherwise 403. The
expected token is never logged — only whether it matched.

## POST — events

```
express.raw({ type: 'application/json' })
      ↓
whatsappWebhookSignatureMiddleware      X-Hub-Signature-256, HMAC-SHA256, timing-safe
      ↓
parseWebhookEnvelope()                  flatten into individually-keyed items
      ↓
persistWebhookEvent()                   UNIQUE(externalEventId) — the idempotency gate
      ↓
processWebhookItem()                    inline, or deferred to the worker
      ↓
200 OK
```

### Signature validation

Missing `WHATSAPP_WEBHOOK_APP_SECRET` in production → **503**, never a bypass. Outside
production it logs a warning and accepts, so local development works without Meta.
An invalid signature → **401**. A body that will not parse → **400**.

## Idempotency

Meta redelivers on any non-2xx and occasionally duplicates on success. Each item gets a
stable `externalEventId`:

| Kind | Key |
| --- | --- |
| message | `msg:<wamid>` |
| status | `status:<wamid>:<status>` |
| template status | `tpl:<name>:<lang>:<event>:<id>` |

The status key includes the status value because `sent`, `delivered` and `read` share one
wamid and are three distinct events.

A duplicate insert (`P2002`) means an earlier delivery already claimed the event, and
**all side effects are skipped**. So a redelivery produces no second message, conversation,
lead, notification or automation.

There is a second, independent guard: `WhatsAppMessage` has
`UNIQUE(tenantId, externalMessageId)`, so even a bypassed gate cannot create a duplicate
inbound message.

## Why the endpoint always returns 200

Once the payload is persisted, the work is durable. Returning 5xx would make Meta redeliver
the whole batch — pointless when the events are already stored and deduplicated. Processing
failures leave the event row `Failed`, and the webhook worker retries it up to
`WHATSAPP_WEBHOOK_MAX_RETRIES` before leaving it alone.

## Inline vs. async processing — an open operational decision

`WHATSAPP_ASYNC_WEBHOOK` defaults to **false**: the request persists *and* processes before
responding.

- **Inline (default)**: simpler, ordering is deterministic, matches the behaviour that was
  already in production here. But a slow DB makes Meta's webhook call slow.
- **Async (`true`)**: the request returns as soon as the payload is stored; the cron worker
  does the work within a minute. This is the architecturally preferred shape and is fully
  implemented — it is not the default only because it changes observable timing for the
  existing manager-forward flow.

Recommendation: switch to `true` once you have confirmed the manager forward still behaves
acceptably with up to a minute of delay.

## Tenant resolution

1. `WHATSAPP_TENANT_ID`, if set.
2. A template whose `metadata.phoneNumberId` matches the receiving number.
3. The single active tenant.

With several active tenants and no mapping, the event is logged as an error and skipped.
Guessing would leak one tenant's messages into another, so it is deliberately not done.

## Retention

Processed and ignored webhook events older than `WHATSAPP_WEBHOOK_RETENTION_DAYS` (90) are
deleted by the nightly cleanup job. Failed events are kept for investigation.

## Legacy behaviour

The pre-existing `WhatsAppInboundMessage` table, the manager forward, and the booking
`managerComments` note are untouched and still run on every inbound message. The new module
runs alongside them. If you migrate the manager workflow to the new inbox, that legacy path
in `whatsappWebhook.controller.ts` (`runLegacyInboundFlow`) is what to remove.
