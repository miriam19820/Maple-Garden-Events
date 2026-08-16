# Monitoring & Observability

Production-grade health, logging, APM, and alerting for Maple Garden Events.

## Step 1 — Audit summary (pre-change baseline)

| Area | Before | Gap |
|------|--------|-----|
| Health | `GET /api/health` → `{ status: "ok" }` only | No DB / Redis / S3 / email checks |
| Logs | Winston + daily rotate; custom `requestLogger` | Solid local logs; no process-level crash hooks |
| Errors | Sentry Node + React (DSN optional) | Missing `unhandledRejection` / `uncaughtException`; cron failures logged only |
| APM | None | No slow-query / slow-request tracking or in-process counters |
| Alerts | Business WhatsApp/email to manager | No ops webhook/email on 500s, crashes, or cron failures |

## Step 2 — What shipped

### Health endpoints

| Path | Purpose | Failure mode |
|------|---------|--------------|
| `GET /api/health/live` | Process liveness (cheap) | Always 200 if Node is up |
| `GET /api/health` / `GET /api/health/ready` | Deep readiness | **503** if database down; **200** if `ok` or `degraded` |
| `GET /api/health/metrics` | In-process APM counters | Always 200 |

Deep checks: PostgreSQL (`SELECT 1`), Redis (if `REDIS_URL`), S3 `HeadBucket` (if `S3_BUCKET`), email config presence, EasyCount mode metadata.

Query `?metrics=0` omits the metrics blob on readiness responses.

**Docker HEALTHCHECK** uses `/api/health/live` so a short DB blip does not kill the container. **App Runner / CD smoke** should hit `/api/health/ready` (HTTP 200 = DB reachable).

### Error & log tracking

**Backend**

- Winston file + console logging (`server/src/utils/logger.ts`)
- HTTP request logging with slow-request warnings (`SLOW_REQUEST_MS`, default 2000)
- Sentry (`SENTRY_DSN`) via `server/src/config/sentry.ts` + `instrument.ts`
- Process guards: `unhandledRejection` and `uncaughtException` → log + Sentry + critical alert (`server/src/utils/processGuards.ts`)
- Express 5xx → Sentry + critical alert (`errorHandler`)
- Cron/backup failures → `reportBackgroundFailure` (`criticalAlert.service.ts`)

**Frontend**

- `@sentry/react` when `VITE_SENTRY_DSN` is set at build time
- `Sentry.ErrorBoundary` around `<App />` with `ErrorFallback`
- API client captures failed fetches / non-OK responses

### APM (lightweight)

- Prisma `$extends` timing: slow queries logged (+ Sentry warning) when ≥ `SLOW_QUERY_MS` (default 500)
- Optional `PRISMA_LOG_QUERIES=true` for engine query events
- HTTP duration in `requestLogger`; counters in `apmMetrics.ts`
- Snapshot exposed on `/api/health` and `/api/health/metrics`

This complements Sentry performance traces (`SENTRY_TRACES_SAMPLE_RATE` / `VITE_SENTRY_TRACES_SAMPLE_RATE`). It is not a full Prometheus/OpenTelemetry stack — add those later if CloudWatch/Grafana scraping is required.

### Alerting architecture

```
Critical event (500 / crash / unhandled / cron fail)
        │
        ├─► Winston error log
        ├─► Sentry (if DSN set)
        └─► notifyCriticalAlert (deduped by ALERT_COOLDOWN_MS)
                ├─► ALERT_WEBHOOK_URL  (Slack/Discord/Teams-compatible JSON POST)
                └─► Email to MANAGER_ALERT_EMAIL or MANAGER_EMAIL (if SMTP configured)
```

Webhook JSON shape:

```json
{
  "type": "maple.critical_alert",
  "title": "...",
  "message": "...",
  "severity": "critical|error",
  "source": "express.errorHandler|process.uncaughtException|cron:...",
  "context": {},
  "tenant": "maple-garden",
  "environment": "production",
  "timestamp": "ISO-8601"
}
```

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `SENTRY_DSN` | Server runtime | Backend error/APM |
| `SENTRY_TRACES_SAMPLE_RATE` | Server | Trace sample rate (default 0.1) |
| `VITE_SENTRY_DSN` | Client **build** | Frontend Sentry |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Client build | Frontend traces |
| `ALERT_WEBHOOK_URL` | Server | Ops webhook |
| `ALERT_COOLDOWN_MS` | Server | Alert dedupe window (default 300000) |
| `MANAGER_ALERT_EMAIL` / `MANAGER_EMAIL` | Server | Alert email recipient |
| `EMAIL_USER` / `EMAIL_PASS` | Server | SMTP for alert mail |
| `SLOW_QUERY_MS` | Server | Prisma slow threshold |
| `SLOW_REQUEST_MS` | Server | HTTP slow threshold |
| `HEALTH_CHECK_TIMEOUT_MS` | Server | Per-check timeout |
| `PRISMA_LOG_QUERIES` | Server | Verbose Prisma query events |
| `TENANT_NAME` / `VITE_TENANT_NAME` | Both | Sentry tenant tag |

See `server/.env.example`, `client/.env.example`, `infra/env.*.example`.

## Ops checklist

1. Set `SENTRY_DSN` (server) and `VITE_SENTRY_DSN` (CI Docker build-arg / GitHub secret).
2. Set `ALERT_WEBHOOK_URL` to a Slack incoming webhook (or Discord/Teams).
3. Point App Runner / LB **liveness** at `/api/health/live` and **readiness** at `/api/health/ready`.
4. Confirm smoke test uses readiness (deploy workflow already does).
5. Optionally tune `SLOW_QUERY_MS` / `SLOW_REQUEST_MS` after a week of staging traffic.

## Application error reporting (PR A)

### Backend

| Helper | When to use |
|--------|-------------|
| `AppError` / subclasses (`ForbiddenError`, …) | Throw from routes/services for **expected** business failures (`isOperational: true`, usually 4xx) |
| `AppError.internal(...)` | Unexpected bugs — `isOperational: false` → Sentry + alert via `errorHandler` |
| `errorHandler` + `catchAsync` | Preferred HTTP path; reports when `shouldReportToMonitoring(err, statusCode)` |
| `reportUnexpectedError` / `reportSideEffectFailure` | Failures **outside** Express (post-commit PDF/EasyCount/email, fire-and-forget sync, silent local 500 handlers) |

**Do not** swallow payment / EasyCount / ledger side effects with empty `.catch()`. Soft-fail the HTTP response if needed, but always call `reportSideEffectFailure`.

### Frontend

| Helper | When to use |
|--------|-------------|
| `Sentry.ErrorBoundary` | Render-time crashes only (shows `eventId` + optional report dialog) |
| `reportClientError` | Async handlers / preload `.catch` — toast/alert for UX **and** Sentry |
| React Query `QueryCache` / `MutationCache` `onError` | Automatic Sentry for failed queries/mutations |

**Do not** rethrow routine API failures into the ErrorBoundary (would replace the whole UI).

### HTTP route standardization (PR B)

High-traffic controllers/routes use `catchAsync` so failures reach `errorHandler` (Sentry + alerts for unexpected / ≥500).

`requestLogger` is a **safety net**: if a response finishes with status ≥500 and `res.locals.monitoringReported` was not set by `errorHandler`, it captures a Sentry exception. Prefer fixing the handler to throw/`next(err)` rather than relying on the safety net.

### Integrations & high-stakes UI (PR C)

| Helper | When |
|--------|------|
| `reportIntegrationFailure('email'\|'whatsapp'\|…)` | Soft-fail SMTP/WhatsApp (and similar). **Auth/credential** reasons → critical alert; other failures → Sentry only |
| `runUserAction(fn, { onError, tags })` | Client async handlers (invoices, EasyCount retry, contract sign, notify, login network). Toast/alert + Sentry; **not** ErrorBoundary |

S3 upload failures on HTTP paths are covered by `catchAsync` → `errorHandler` (no extra integration wrapper, to avoid double alerts).
