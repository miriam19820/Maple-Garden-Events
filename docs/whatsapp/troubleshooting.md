# Troubleshooting

Start with `GET /api/whatsapp/settings` (manager only). It reports provider, which secrets
are present (never their values), outbox depth by status, counters, and a list of issues.

## Nothing is being sent

| Check | Where |
| --- | --- |
| `WHATSAPP_ENABLED=true`? | settings → `config.enabled` |
| Provider is `meta`, not `fake`? | settings → `config.provider` |
| Are rows piling up as `Pending`? | settings → `outbox.Pending` |
| Is the cron worker running? | log line `WhatsApp cron jobs registered` at boot |

`fake` provider means messages are marked Sent but nothing left the building. That is the
intended default for local development.

## A message is stuck in Pending

Either `nextAttemptAt` is in the future (a scheduled retry — check `lastErrorCode`), or the
worker is not ticking. `WhatsAppOutboxMessage.lastError` holds the last provider message.

## A message went straight to Failed

Look at `lastErrorCode`:

| Code | Meaning | Fix |
| --- | --- | --- |
| `InvalidPhoneNumber` | Not a WhatsApp user, or unparseable | Fix the number on the booking |
| `TemplateNotApproved` | `metaStatus` is not `Approved` | Get Meta to approve it |
| `TemplateNotFound` | No local row for that name+language | Register it |
| `MessageNotAllowed` | Outside the 24h window | Use an approved template |
| `AuthenticationFailed` | Token expired/revoked, or missing permission | Issue a permanent system-user token |
| `WhatsAppNotConfigured` | Integration off or credentials missing | See configuration.md |

`RateLimited`, `ProviderUnavailable` and `NetworkError` are the only retryable codes.
Everything else fails on the first attempt by design — retrying an invalid number forever
achieves nothing.

## Meta cannot verify the webhook

- URL must be publicly reachable over HTTPS and end in `/api/webhooks/whatsapp`.
- `hub.verify_token` must equal `WHATSAPP_WEBHOOK_VERIFY_TOKEN` exactly.
- Look for `WhatsApp webhook verification failed` with `tokenMatch: false`.

## Webhook POSTs return 401

Signature mismatch. Usually one of:

- `WHATSAPP_WEBHOOK_APP_SECRET` is the wrong value (it is the **App Secret**, not the token).
- Something re-serialised the body before the raw middleware. The route must stay mounted
  before `express.json` in `app.ts`.

## Webhook POSTs return 503 in production

`WHATSAPP_WEBHOOK_APP_SECRET` is unset. Production deliberately refuses to accept unsigned
webhooks rather than trusting them.

## Inbound messages arrive but no conversation appears

- Several active tenants and no mapping → look for `Cannot resolve tenant for WhatsApp
  webhook`. Set `WHATSAPP_TENANT_ID`.
- Check `WhatsAppWebhookEvent` for the event: `status` `Failed` with an `error` means
  processing threw; the worker retries up to `WHATSAPP_WEBHOOK_MAX_RETRIES`.

## Delivery status never advances past Sent

- Subscribe to the `messages` webhook field in the Meta app (it carries statuses too).
- Statuses are matched on `externalMessageId` only. A message sent from the WhatsApp
  Business app rather than this API has no local row, so its statuses are correctly ignored.

## An automation is not firing

1. `WHATSAPP_AUTOMATION_ENABLED=true`?
2. The rule's `isEnabled` is true?
3. The rule's `tenantId` matches the booking's?
4. Already sent? Check for an outbox row with the matching `dedupeKey` — dedupe is
   permanent for once-ever automations.
5. `lastRunAt` tells you whether the handler ran at all.

## A customer got the same message twice

Two paths can send: the legacy cron in `utils/cronJobs.ts` and a new automation rule. See
"Overlap with the existing cron jobs" in automation.md. Within the new module alone, the
`dedupeKey` unique index makes a duplicate impossible.

## Duplicate sends after a worker restart

Not possible: claiming is a conditional `UPDATE ... WHERE status = 'Pending'`, so only one
worker wins. A claim abandoned by a crashed worker is released after
`WHATSAPP_CLAIM_TIMEOUT_MS` and retried — which can re-send a message that Meta actually
accepted but whose response was lost. That is the standard at-least-once trade-off; raise
the timeout if it matters more than latency.
