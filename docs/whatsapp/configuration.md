# WhatsApp Configuration

All settings are read from the environment through `server/src/config/whatsapp.config.ts`.
No WhatsApp secret is ever read from a committed file, written to a migration, or logged.

`server/.env.example` has the full list with safe defaults. Highlights:

## Master switches

| Variable | Default | Meaning |
| --- | --- | --- |
| `WHATSAPP_ENABLED` | `false` | Nothing is sent while this is false, whatever the provider is. |
| `WHATSAPP_PROVIDER` | `fake` (auto) | `meta` \| `fake` \| `disabled`. |

`WHATSAPP_PROVIDER` is auto-resolved when unset: `meta` only if real credentials exist
and `NODE_ENV !== 'test'`; `fake` otherwise. A fresh checkout therefore cannot send.

## Credentials (never commit these)

`WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_APP_SECRET`.

Legacy names still work as fallbacks: `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_GRAPH_VERSION`.

If `WHATSAPP_ENABLED=true` with the `meta` provider and any of these is missing, the
server refuses to boot (`validateEnv`) rather than failing silently on every send.

## Graph API

| Variable | Default |
| --- | --- |
| `WHATSAPP_GRAPH_API_BASE_URL` | `https://graph.facebook.com` |
| `WHATSAPP_API_VERSION` | `v25.0` |
| `WHATSAPP_TIMEOUT_MS` | `15000` |

The latest Graph API version at the time of writing is **v26.0** (released 2026-07-29).
The default is pinned to **v25.0** (2026-02-18, supported until 2028-07-29) so the
integration does not track breaking changes automatically. Bump it deliberately.

## Retry

| Variable | Default | Notes |
| --- | --- | --- |
| `WHATSAPP_RETRY_MAX_ATTEMPTS` | `5` | Hard ceiling. There is no unbounded retry path. |
| `WHATSAPP_RETRY_INITIAL_DELAY_MS` | `30000` | Doubles per attempt. |
| `WHATSAPP_RETRY_MAX_DELAY_MS` | `3600000` | Also caps a provider `Retry-After`. |
| `WHATSAPP_CLAIM_TIMEOUT_MS` | `300000` | After this, a claim from a dead worker is released. |

Jitter is ±20%, fixed in code.

## Features

| Variable | Default | Notes |
| --- | --- | --- |
| `WHATSAPP_ASYNC_WEBHOOK` | `false` | See webhooks.md — an open operational decision. |
| `WHATSAPP_FORWARD_INBOUND_TO_MANAGER` | `true` | Controls the pre-existing manager forward. |
| `WHATSAPP_AUTOMATION_ENABLED` | `false` | Rules also need `isEnabled` individually. |
| `WHATSAPP_STORE_RAW_PAYLOADS` | `true` | Set false to keep less customer content. |

## Behaviour

`WHATSAPP_DEFAULT_LANGUAGE` (`he`), `WHATSAPP_DEFAULT_COUNTRY_CODE` (`972`),
`WHATSAPP_OUTBOX_BATCH_SIZE` (`20`), `WHATSAPP_WEBHOOK_RETENTION_DAYS` (`90`),
`WHATSAPP_WEBHOOK_MAX_RETRIES` (`5`).

`WHATSAPP_TENANT_ID` is only needed when several active tenants share one WhatsApp
number — otherwise the single active tenant is used. With multiple active tenants and no
mapping, inbound messages are logged and skipped rather than attributed to a guess.

## Worker schedules

`WHATSAPP_OUTBOX_CRON` (`* * * * *`), `WHATSAPP_WEBHOOK_CRON` (`* * * * *`),
`WHATSAPP_AUTOMATION_CRON` (`30 8 * * *`), `WHATSAPP_CLEANUP_CRON` (`30 3 * * *`).

## Inspecting configuration at runtime

`GET /api/whatsapp/settings` (manager only) returns `describeWhatsAppConfig()` — booleans
about whether each secret is present, never the values. Safe to log and to show in the UI.
