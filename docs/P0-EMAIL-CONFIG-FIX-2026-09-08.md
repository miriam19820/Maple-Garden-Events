# P0 fix — eliminate silent email misconfiguration

**Date:** 2026-09-08 · **Closes:** blocker **B-1** of `FEEDBACK-EMAIL-DELIVERY-AUDIT-2026-09-08.md`
**Scope:** configuration + health only. The delivery architecture, the transport, the
state machine and the Gmail provider are unchanged.

## The invariant

> A production system must never silently simulate customer email delivery because
> required email credentials are missing.

Enforced in two independent places:

1. **Boot** — `validateEnv()` logs a `CRITICAL` error naming the missing variables
   and stating that customer mail will be simulated.
2. **Readiness** — `checks.email` reports `down`, and the aggregate becomes
   `degraded`. **This is the alertable signal**; a boot log can be scrolled past.

### Why it warns instead of refusing to boot

Refusing to start would take bookings, contracts, payments and the calendar offline
over a *mail* credential — a much larger outage than the one being prevented. The
failure is therefore made **loud, not fatal**. This is a deliberate trade-off and it
puts a requirement on operations: **`/health/ready` must be monitored**, and
`status: degraded` with `checks.email.status: down` must page someone. Without that
monitoring, this fix degrades back towards the original problem — the signal exists,
but nobody reads it.

## Design decision: no `EMAIL_ENABLED` flag

Post-event feedback is a core product feature. A production server that cannot send
mail is a misconfiguration, never an intentional mode, so there is deliberately no
switch to turn email off. This follows the existing WhatsApp precedent
(`process.exit(1)` on incomplete config) without copying its opt-in flag, which
WhatsApp needs because it genuinely is optional.

Outside production nothing changes: the mailer's simulation fallback remains the
intended developer experience and only warns.

## Configuration states

See `FEEDBACK-FLOW.md` §8.1 for the operator-facing table.

| State | Boot | `checks.email` | Aggregate | Delivery |
|---|---|---|---|---|
| configured | starts | `ok` | `ok` | real SMTP |
| unavailable (prod, missing) | starts, **`CRITICAL` log** | `down` | `degraded` | simulated, never counted as sent |
| simulated (non-prod, missing) | warns | `skipped` | `ok` | logged only, never counted as sent |
| intentionally disabled | not supported by design | — | — | — |

## Changes

| File | Change | Why |
|---|---|---|
| `server/src/config/emailConfig.ts` **(new)** | `getEmailUser`/`getEmailPass` (moved verbatim from `mailer.ts`), `describeEmailConfig()`, `isEmailRequired()`, `emailHealthCheck()` | One rule, dependency-free, so boot validation / health / transport cannot disagree — notably about the legacy `EMAIL_PASSWORD` spelling, which the transport accepted and the health check did not |
| `server/src/config/env.ts` | `validateEmailEnv()`, called from `validateEnv()` | Production without credentials now fails **loudly** at boot instead of silently; startup is not blocked (see above) |
| `server/src/utils/mailer.ts` | credential resolution delegated to `emailConfig`; `canSendRealMail()` now `describeEmailConfig().configured` | Same rule as validation; **no behaviour change** |
| `server/src/Services/health.service.ts` | `checkEmail()` delegates to `emailHealthCheck()` | Production missing → `down`, not `skipped`; also fixes the `EMAIL_PASSWORD` blind spot |
| `server/src/Services/healthStatus.ts` | a non-DB `down` now yields overall `degraded` | Pre-existing bug: only `degraded` was counted, so a hard-down dependency reported overall `ok`. Without this the new `down` would have been invisible. DB down still → `down`/503; a non-DB dependency never forces 503 |
| `server/tests/emailConfig.test.ts` **(new, 20)** | resolution, boot validation, readiness classification, aggregate | Proves the invariant in both directions |
| `server/tests/mailerSimulation.test.ts` **(new, 8)** | `deliverMail` directly | Closes audit §14; proves simulation never looks like delivery and never opens a transport |
| `server/tests/feedbackDispatch.test.ts` | +1 test | Proves the P0 change did **not** break: simulated → not SENT → still retryable |
| `server/tests/health.aggregate.test.ts` | +1 test | Locks in non-DB `down` ⇒ `degraded` |
| `docs/FEEDBACK-FLOW.md` | §8 row + new §8.1 | Operator documentation of the four states and the verify command |

Nothing was weakened: no assertion was relaxed and no test removed.

## Deployment note

**No breaking change.** A production server without `EMAIL_USER`/`EMAIL_PASS` still
boots and still serves every other feature exactly as before; what changes is that it
now says so — loudly in the log, and as `degraded` on `/health/ready`.

The one operational requirement this introduces: **`/health/ready` must be watched.**
Alert on `status != "ok"`, and treat `checks.email.status == "down"` as "customer mail
is not being delivered". Without that alert the fix is only half in force.

## Verification

* Targeted suites: 7 suites / 95 tests, green before and after.
* Full container suite: **302 assertions pass, 0 fail** (was 256/0). 7 suites cannot
  run in the cloud container — all fail identically at import with
  `Cannot find module '.prisma/client/default'` (the Prisma client is generated on the
  developer machine only). None touches the email path.
* `tsc --noEmit` over `src` + `tests`: exit 0.
* SMTP credential: present and App-Password-shaped; authentication **UNVERIFIED** —
  both sandboxes refuse DNS for `smtp.gmail.com` (`EAI_AGAIN`), which is the sandbox,
  not a rejection. Run the §8.1 command on the production host to close it.

## Deliberately NOT done (audit §18 / P0-8)

Gmail → SES/Postmark migration, webhooks, bounce processing, suppression lists, SMTP
timeouts, `tenantId` on the post-send `updateMany`, log masking, HTML-escaping the
client name, rate-limiting `POST /admin/send`, CAS-claiming manual sends. All remain
open and are unaffected by this change.
