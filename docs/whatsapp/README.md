# WhatsApp Business Integration

| Document | Contents |
| --- | --- |
| [architecture.md](./architecture.md) | Module layout, data flow, invariants |
| [setup.md](./setup.md) | Connecting a real Meta WhatsApp Business account |
| [configuration.md](./configuration.md) | Every environment variable |
| [webhooks.md](./webhooks.md) | Verification, signatures, idempotency, processing |
| [templates.md](./templates.md) | Template lifecycle and Meta approval |
| [automation.md](./automation.md) | Adding an automation; open business questions |
| [troubleshooting.md](./troubleshooting.md) | Common failures and diagnostics |

## Status

**No real WhatsApp credentials are configured.** The integration ships disabled
(`WHATSAPP_ENABLED=false`) with the fake provider, so a fresh checkout cannot send anything.

## Local development

```bash
# server/.env — no Meta account needed
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=fake
WHATSAPP_AUTOMATION_ENABLED=true
```

The fake provider performs no network I/O and returns deterministic ids
(`fake.wamid.000001`). You can exercise the whole path locally: queue a message, watch the
outbox worker move it `Pending → Processing → Sent`, post a synthetic webhook to
`/api/webhooks/whatsapp` (no signature needed outside production) and watch a conversation
and inbound message appear.

## Tests

```bash
npm test -w server -- tests/whatsapp
```
