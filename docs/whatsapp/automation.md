# Automation

## The shape

```
Trigger  →  enabled rules for (trigger, tenant)  →  handler  →  conditions  →  queue message
```

`runTrigger(trigger, context)` is the only entry point. It loads the enabled
`WhatsAppAutomationRule` rows for that trigger and tenant and hands each to its registered
handler. No business rule lives in the registry, and there is no worker per reminder type.

Automations run only when **both** are true:

- `WHATSAPP_AUTOMATION_ENABLED=true` (and `WHATSAPP_ENABLED=true`)
- the individual rule's `isEnabled` column

Both default to off.

## Triggers

| Trigger | Fired by | Context |
| --- | --- | --- |
| `ContractSigned` | business code, after a booking becomes signed | `bookingId`, optional contract PDF |
| `ProductionFormReady` | the "Send via WhatsApp" action | `bookingId`, document base64 |
| `IncomingMessage` | the webhook processor | conversation, phone, text, wamid |
| `PaymentOverdue` | the daily automation worker | tenant, `now` |
| `EventApproaching` | the daily automation worker | tenant, `now` |

## Business rules are reused, not reinvented

| Question | Answer used | Source |
| --- | --- | --- |
| When is a contract complete? | `booking.isContractSigned` | `utils/contractFields.ts` — set only when the flag *and* every signature required for that event type are present |
| Which payments are overdue? | `evaluateBookingPaymentStatus()` | `Services/paymentDeadlineService.ts` — hall balance + the contract's payment-terms template |
| Which selections are mandatory? | tablecloth+napkin, final guest count, kashrut | the existing morning cron in `utils/cronJobs.ts` |
| How many days before an event? | rule config, default `[30, 14, 7]` | the brief; configurable per rule |

`ContractSigned` re-reads `isContractSigned` from the database rather than trusting the
caller, so a mistaken trigger cannot send a confirmation for an unsigned contract.

## Adding a new automation — no new worker

Example: "remind about the music selection 21 days before the event".

1. `music` already exists in `REQUIREMENT_CHECKS` (`handlers/eventApproaching.ts`). For a
   genuinely new requirement, add one entry there:

```ts
lighting: { label: 'תאורה', isMissing: (form) => !form?.hasLighting },
```

2. Create a rule:

```
POST /api/whatsapp/automations
{
  "name": "music selection reminder",
  "triggerType": "EventApproaching",
  "triggerConfiguration": { "daysBefore": [21], "requirements": ["music"], "onlyWhenMissing": true },
  "templateId": "<approved template id>",
  "isEnabled": true
}
```

No deployment, no new cron entry.

For a genuinely new trigger kind, add a handler implementing `AutomationHandler<T>` and
register it in `automation/registry.ts`. That is the only code change.

## Message text is configuration

Handlers never contain customer-facing copy. A rule sends either:

- `templateId` → an approved Meta template with named parameters, or
- `actionConfiguration.bodyTemplate` → free-form text with `{{placeholder}}` substitution
  (only deliverable inside the 24h window)

## Duplicate protection

Every action carries a stable `dedupeKey` on the outbox row, unique per tenant:

| Automation | Key | Effect |
| --- | --- | --- |
| ContractSigned | `rule:<id>:contract-signed:<bookingId>:<phone>` | once per booking, ever |
| EventApproaching | `rule:<id>:approaching:<bookingId>:d<days>` | once per booking per milestone |
| PaymentOverdue | `rule:<id>:overdue-manager:<bookingId>:<YYYY-MM-DD>` | at most once per day |
| IncomingMessage | `rule:<id>:inbound-notify:<wamid>` | once per inbound message |

## ⚠️ Overlap with the existing cron jobs

The daily jobs in `utils/cronJobs.ts` already send overdue-payment manager alerts and
missing-selection reminders through `utils/whatsapp.ts`. Those were left untouched.

`PaymentOverdue` and `EventApproaching` automations **duplicate** that behaviour. They are
disabled by default for exactly this reason. Enable them only as part of migrating off the
legacy path, and disable the corresponding legacy block in the same change.

## Open business questions (deliberately not guessed)

These were not determinable from the codebase and are configuration, not hard-coded rules:

1. **Which manager receives an alert?** Currently `MANAGER_ALERT_PHONE`, overridable per
   rule via `actionConfiguration.managerPhone`. There is no per-tenant manager routing.
2. **How many days before an event should reminders go out?** Default `[30, 14, 7]` from
   the brief. The existing cron uses "≤30 days, weekly on Sunday, daily under 10 days" —
   a different policy. Pick one deliberately.
3. **What counts as final production approval?** No such flag exists on `EventForm`.
   `ProductionFormReady` is therefore caller-driven, not detected.
4. **Is the customer or only the manager notified about overdue payments?**
   `triggerConfiguration.notify` — defaults to `manager` only.

## Not implemented

The conversational lead-capture bot (Scenario F) is **not** built. The seams for it exist —
`IncomingMessage` with an auto-reply, conversation state, and `interactive` message support
in the provider — but there is no state machine collecting event type, date and guest count,
and no Lead entity. That is a separate piece of work.
