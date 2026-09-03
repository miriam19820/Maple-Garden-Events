# Templates

## Meta owns approval

A row in `WhatsAppTemplate` is **local configuration**. It records that this application
knows about a template — nothing more. Meta decides whether it can actually be sent.

```
Draft ──submit in Meta──▶ Pending ──▶ Approved
                                 └──▶ Rejected
Approved ──Meta pauses/disables──▶ Disabled
```

`metaStatus` starts at `Draft` and is only ever changed by `syncTemplateMetaStatus()`,
which is called from the `message_template_status_update` webhook or an explicit admin sync.
Neither `POST /api/whatsapp/templates` nor the seed script can set it. A seeded template is
always `Draft` and is never presented as approved.

`assertTemplateSendable()` gates every template send and throws `TemplateNotApproved`
unless `metaStatus === 'Approved'`.

## Why templates matter

Meta only allows free-form messages within **24 hours** of the customer's last inbound
message. Outside that window, a template is the only option. `queueWhatsAppMessage`
enforces this: a `text` send outside the window is rejected with `MessageNotAllowed`
*before* it is queued, rather than burning five retry attempts on a certain rejection.

## Registering a template

```
POST /api/whatsapp/templates          (manager only)
{
  "name": "contract_signed",          // lowercase, digits, underscores — Meta's rule
  "language": "he",
  "category": "UTILITY",
  "bodyPreview": "שלום {{1}}, החוזה שלך לתאריך {{2}} נחתם.",
  "parameters": [
    { "position": 1, "key": "customerName", "example": "ישראל ישראלי" },
    { "position": 2, "key": "eventDate",    "example": "01/08/2026" }
  ]
}
```

`bodyPreview` is for the UI only. Meta stores the real body; this copy can drift and is
not the source of truth.

## Parameters

`parameters` maps Meta's positional placeholders to names. At send time,
`buildTemplateComponents(spec, values)` turns named values into Meta's `components`:

```jsonc
[{ "type": "body", "parameters": [ { "type": "text", "text": "ישראל ישראלי" },
                                   { "type": "text", "text": "01/08/2026" } ] }]
```

A missing value renders as `—` rather than an empty string, because Meta rejects empty
template parameters.

Only the **body** component is generated. Header, button and URL parameters must be passed
explicitly by the caller.

## Suggested templates for this venue

| Name | Scenario | Parameters |
| --- | --- | --- |
| `contract_signed` | A — contract fully signed | customerName, eventDate, guestCount, totalPrice |
| `production_form_ready` | B — final production document | customerName, eventCode |
| `payment_overdue_manager` | C — manager alert | customerName, eventCode, dueDate, remainingAmount |
| `event_approaching` | D — missing selections | customerName, eventDate, missingItems |
| `lead_welcome` | F — first reply to an unknown number | — |

These are **suggestions**, not seeded approvals. Each must be submitted to Meta and
approved before it will send.
