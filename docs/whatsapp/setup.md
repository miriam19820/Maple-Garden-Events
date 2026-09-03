# Connecting a real Meta WhatsApp Business account

Nothing in this repository is connected to a live WhatsApp account. This is the checklist
to get there.

> Do not migrate a production phone number or change a live Meta Business account without
> an explicit decision and a backup plan.

## 1. Meta side

1. **Meta Business Account** — create or identify the business.
2. **WhatsApp Business Account (WABA)** — add the WhatsApp product to a Meta app.
3. **Phone number** — add and verify one. Note its **Phone Number ID** (not the phone number).
4. **System user + access token** — create a system user with `whatsapp_business_messaging`
   and `whatsapp_business_management`, then generate a **permanent** token. A 24-hour
   developer token will silently break the integration the next day.
5. **App secret** — from App Settings → Basic. Used for webhook signature verification.
6. **Message templates** — submit and get them approved (see templates.md).

## 2. Application side

Set these where your deployment keeps secrets (never in a committed file):

```
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=meta
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<a long random string you invent>
WHATSAPP_WEBHOOK_APP_SECRET=...
```

Then apply the database migration:

```bash
npm run db:generate -w server
npm run db:migrate -w server        # dev
npm run db:migrate:deploy -w server # production
```

## 3. Webhook

In the Meta app → WhatsApp → Configuration:

- **Callback URL**: `https://YOUR_DOMAIN/api/webhooks/whatsapp`
- **Verify token**: the same `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- **Subscribe to fields**: `messages` (required), `message_template_status_update` (recommended)

Meta will immediately `GET` the URL with a challenge. See webhooks.md if it fails.

## 4. Register your templates locally

An approved Meta template also needs a local row before it can be sent:

```
POST /api/whatsapp/templates
{ "name": "contract_signed", "language": "he", "category": "UTILITY",
  "parameters": [ { "position": 1, "key": "customerName" },
                  { "position": 2, "key": "eventDate" } ] }
```

The row is created as `Draft`. It becomes `Approved` only when Meta says so — via the
`message_template_status_update` webhook. **A local row is never treated as approval.**

## 5. Turn automations on

Automations need `WHATSAPP_AUTOMATION_ENABLED=true` *and* each rule's own `isEnabled`.
Both default to off. See automation.md.

## 6. Verify

1. `GET /api/whatsapp/settings` → `status: "ok"`, no `issues`.
2. Send yourself a template via `POST /api/whatsapp/messages`.
3. Watch the outbox row go `Pending → Processing → Sent`.
4. Reply from your phone; confirm a conversation and an inbound message appear.
5. Confirm the outbound message reaches `Delivered` and then `Read`.
