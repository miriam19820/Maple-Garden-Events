# Review / Feedback **Email Delivery** — production-readiness audit

**Date:** 2026-09-08 · **Scope:** the email leg of the post-event feedback flow
(`mailer.ts` → `feedbackHelpers.ts` → `cronJobs.ts` → `feedback.controller.ts`)
**Method:** source read of the actual repository + configuration probe on the
operator's machine. No test mail was sent to anyone. No secret is reproduced here.

Legend: **VERIFIED** (proved by evidence) · **PARTIAL** · **GAP** · **UNVERIFIED**
(could not be tested in this environment — *not* the same as "passing").

---

## 1. Delivery flow — end to end

```
cron FEEDBACK_CRON (default "0 * * * *")            cronJobs.ts:195
  → processDueFeedback(now)                          feedbackHelpers.ts:527
    → listTenantIdsWithCandidates                    (distinct tenantId, windowed)
    → per tenant: findFeedbackCandidates             (tenant-scoped, 14-day window)
      → isFeedbackDue(timing, now)                   feedbackSchedule.ts
      → dispatchFeedbackForBooking                   feedbackHelpers.ts:361
        → ensureFeedbackRecordsForBooking            (createMany skipDuplicates)
        → ATOMIC CLAIM  updateMany CAS               feedbackHelpers.ts:377
        → sendFeedbackLinkForRecord                  feedbackHelpers.ts:190
          → sendFeedbackRequestEmail                 mailer.ts:449
            → buildFeedbackRequestMail               mailer.ts:395
            → deliverMail                            mailer.ts:161
              → nodemailer transporter.sendMail      mailer.ts:176
```

A second, manual entry point exists: `POST /api/feedback/admin/send` →
`feedbackController.sendAdmin` (feedback.controller.ts:407) → `sendFeedbackLinkForRecord`
**directly**, bypassing the cron and the atomic claim. See §6.

**Status: VERIFIED.** Both paths converge on one `deliverMail`; there is no second,
divergent email implementation for feedback.

---

## 2. Provider

| Item | Finding |
|---|---|
| Library | `nodemailer` (`mailer.ts:3`) |
| Transport | `nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })` — mailer.ts:56 |
| Provider | **Gmail SMTP** via a Google App Password |
| API-based provider (SendGrid / SES / Postmark / Resend / Mailgun) | **None.** `grep` over `server/package.json` and `server/src` returns no email-API SDK. `@aws-sdk/client-s3` is storage only. |
| Fallback provider | **None.** One transport, one credential. |
| Transport reuse | Module-level singleton, lazily created, `resetTransporterForTests()` for tests. |

**Status: VERIFIED — single provider, no redundancy.** See §18 blocker B-2.

---

## 3. Is delivery REAL, PARTIAL or FAKE?

**REAL when configured; silently SIMULATED when not.**

```ts
// mailer.ts:170
if (!canSendRealMail()) {
  logger.info(`[MAILER SIMULATION] ${simulationLabel} → ${mailOptions.to}`);
  return { ok: true, simulated: true };
}
```

The important detail — and it is correct — is that the simulated result is **not**
counted as a delivery upstream:

```ts
// feedbackHelpers.ts:218
if (emailResult.ok && !emailResult.simulated) { emailSent = true; }
else { skippedReasons.push('מייל: לא מוגדר בשרת (לא נשלח בפועל)'); }
```

so a simulated send never stamps `lastNotifiedAt`, never increments the "sent"
statistics, and leaves the row retryable. A misconfigured server therefore
under-reports rather than lying. **VERIFIED** (covered by
`feedbackDispatch.test.ts:337` — *"a survey with no deliverable contact is not counted as sent"*).

**Real-provider send test: UNVERIFIED.** Neither sandbox has outbound SMTP:

```
$ node verify.js          # on the operator's machine, real .env
EMAIL_USER: CONFIGURED
EMAIL_PASS: CONFIGURED (len 16)          ← Google App Password shape
SMTP VERIFY: FAIL code=EDNS msg=getaddrinfo EAI_AGAIN smtp.gmail.com
```

`EAI_AGAIN` is DNS refusal by the sandbox, **not** an authentication failure — it
proves nothing about the credential. The credential is present and correctly shaped;
whether Google accepts it is untested. See §15 for the one-command test to run on
the production host.

---

## 4. Configuration

Reported as CONFIGURED / NOT CONFIGURED only.

| Variable | Read at | Local `server/.env` | Prod delivery |
|---|---|---|---|
| `EMAIL_USER` | mailer.ts:22 | **CONFIGURED** (a `@gmail.com` address) | `env_file: /app/server.env` — outside the repo, **UNVERIFIED** |
| `EMAIL_PASS` | mailer.ts:27 | **CONFIGURED**, 16 chars (App-Password shape) | same, **UNVERIFIED** |
| `EMAIL_PASSWORD` | mailer.ts:27 (legacy alias) | CONFIGURED (duplicate of `EMAIL_PASS`) | — |
| `CLIENT_URL` | feedbackHelpers.ts:90 | `http://localhost:5173` — correct for dev | `https://__DOMAIN__`, injected by `docker-compose.prod.yml:46` — **VERIFIED as non-local in prod** |
| `TZ` | — | not set (host TZ) | `Asia/Jerusalem` (compose:45) — **VERIFIED** |
| `FEEDBACK_*` | feedbackSchedule.ts | not set → documented defaults | not set → defaults |

**GAP (configuration):** `validateEnv()` (`config/env.ts`) hard-requires only
`DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, and validates WhatsApp when it is
switched on. **Email is validated for nothing.** A production deploy that forgets
`EMAIL_USER`/`EMAIL_PASS` boots happily and silently simulates every customer email.
Contrast this with WhatsApp, which `process.exit(1)`s on incomplete config
(env.ts:45). The asymmetry is not justified.

Mitigations that *do* exist: `verifyEmailConnection()` runs at boot
(`server.ts:40`) and logs `Email not configured — set EMAIL_USER and EMAIL_PASS…`,
and `/health/ready` reports `email: { status: 'skipped', detail: 'EMAIL_USER/EMAIL_PASS not set' }`
(health.service.ts:109). But `skipped` does **not** degrade the aggregate health
status, so no alarm fires.

---

## 5. Delivery state machine

```
(no row) --ensureFeedbackRecordsForBooking--> PENDING (notifyAttempts=0)
PENDING  --CAS claim---------------------->  ATTEMPTING (attempts+1, lastNotifyAttemptAt=now)
ATTEMPTING --email or WhatsApp delivered-->  SENT     (lastNotifiedAt set — terminal)
ATTEMPTING --nothing delivered----------->   PENDING  (lastNotifyError set)
PENDING  --attempts >= 5----------------->   PARKED   (manual re-send only)
SENT     --customer submits------------->    COMPLETED
```

**VERIFIED** against the code (feedbackHelpers.ts:246–262, 377–389) and against the
schema (`notifyAttempts`, `lastNotifyAttemptAt`, `lastNotifyError`, `lastEmailSent`,
`lastWhatsappSent`, `lastNotifiedAt`).

Note the deliberate design: `lastNotifiedAt` is stamped if **either** channel
succeeded. Email failing while WhatsApp succeeds is a terminal success for the row —
the customer got the link. `lastEmailSent=false` records which channel actually
carried it, so the distinction is not lost.

---

## 6. Idempotency / duplicate prevention

**Cron path — VERIFIED.** Three independent layers:

1. Rows are created *before* any send (`createMany` + `skipDuplicates` +
   `@@unique([bookingId, clientSide])`), so a retry can never mint a second token.
2. The compare-and-set claim (feedbackHelpers.ts:377) admits exactly one caller per
   row per backoff window — proven in this session by two simultaneous psql sessions
   ending at `notifyAttempts = 1`, and by `feedbackDispatch.test.ts:226`
   *"two concurrent sweeps deliver each recipient exactly once"*.
3. `lastNotifiedAt IS NULL` in the claim predicate makes SENT terminal
   (`feedbackDispatch.test.ts:207`).

Consequence: running the sweep hourly, or running two server replicas, cannot
double-mail a customer.

**Manual path — GAP.** `sendAdmin` calls `sendFeedbackLinkForRecord` directly. It
does **not** take the claim, does **not** increment `notifyAttempts`, and the route
`POST /api/feedback/admin/send` carries **no rate limiter** (`feedback.routes.ts:22`
— compare the public token routes at :24–25, which have one). Two managers clicking
"send" at the same moment, or one double-click, sends the customer two identical
emails. Auth + role are required, so this is a staff-error surface, not an
attack surface. Severity: low. Fix: reuse the CAS claim for manual sends (allowing
an explicit `force` for a deliberate re-send) and put `feedbackLimiter` on the route.

---

## 7. Worker

| Property | Finding |
|---|---|
| Schedule | `FEEDBACK_CRON`, default `0 * * * *` (hourly) — cronJobs.ts:195 |
| Runs in | the API process, via `node-cron` |
| Multi-replica safe | **Yes** — every replica sweeps, the CAS claim makes it harmless |
| Catch-up after outage | Yes, 14-day `FEEDBACK_LOOKBACK_DAYS` window |
| Mass-mail on first deploy | Bounded by the same window — **VERIFIED** |
| Tenant failure isolation | `try/catch` per tenant (feedbackHelpers.ts:548) — `feedbackDispatch.test.ts:384` |
| Booking failure isolation | `try/catch` per booking (:572) — `:358` |
| Transport throw isolation | `try/catch` per recipient (:419) — `:314` |
| Unhandled rejection | Outer `try/catch` in the cron callback (cronJobs.ts:206) |

**Status: VERIFIED.**

**GAP (throughput/latency):** sends are strictly sequential with **no timeout
override** on the transport. Nodemailer's defaults are `connectionTimeout` 2 min /
`greetingTimeout` 30 s / `socketTimeout` 10 min. A single hung SMTP connection
therefore stalls the entire sweep for up to ten minutes, and the next hourly tick
overlaps it. For one venue's nightly handful of surveys this is a latency wart, not
an outage; at scale it is a queue. Fix: pass explicit
`{ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000, pool: true }`.

---

## 8. Retry strategy

| Knob | Value | Where |
|---|---|---|
| In-`deliverMail` retry | **none** — one attempt, classify, return | mailer.ts:175 |
| Worker retry | next cron tick | cronJobs.ts:196 |
| Minimum spacing | `FEEDBACK_RETRY_BACKOFF_MINUTES` = 60 | feedbackSchedule.ts |
| Cap | `FEEDBACK_MAX_NOTIFY_ATTEMPTS` = 5 → PARKED | feedbackSchedule.ts |
| Backoff shape | **fixed** 60 min, not exponential | — |
| Last error kept | `lastNotifyError` (truncated to 500 chars) | feedbackHelpers.ts:260 |

Total retry horizon ≈ 5 h, then the row parks and waits for a human. Given a 14-day
scan window and a next-day send rule, this is proportionate. **VERIFIED.**

**Design note, not a defect:** a permanent failure (bad address, `auth_failed`) is
retried five times exactly like a transient one, because `classifyMailError` result
is recorded but not used to decide retryability. Cheap improvement: park immediately
on `auth_failed` and on SMTP 5.1.1 (no such user).

---

## 9. Transactional consistency

Order of operations per recipient: **claim (DB) → send (network) → record (DB)**.

This is deliberately **at-least-once**, and it is the right choice: the failure
window is "email delivered but the follow-up `updateMany` failed", which yields at
worst one duplicate email on a later tick — never a customer who is silently never
asked. The reverse ordering would lose surveys.

There is no distributed transaction and none is needed. **VERIFIED.**

**Minor inconsistency:** the post-send write is
`db.feedback.updateMany({ where: { token: feedback.token } })` (feedbackHelpers.ts:248,
:258) with **no `tenantId` predicate**, unlike the claim at :377. It is safe today —
the token is a globally unique v4 UUID and is the credential itself — but it is the
one feedback write that does not carry the tenant filter, and it contradicts
`docs/FEEDBACK-FLOW.md §6`. Recommend adding `tenantId` for defence in depth.

---

## 10. Email content

`buildFeedbackRequestMail` (mailer.ts:395) is exported specifically so the exact
customer-facing message is assertable without a transport.

| Item | Finding |
|---|---|
| `from` | `"<resolved brand name>" <EMAIL_USER>` — mailer.ts:40 |
| `subject` | i18n catalog, non-empty — asserted (`feedbackMessages.test.ts:66`) |
| HTML part | present, RTL, inline-styled, table-free but simple |
| **Plain-text part** | **present** (mailer.ts:408) — good deliverability hygiene |
| Survey link | present in **both** parts — asserted (`:39`) |
| Logo | `cid:` inline attachment, degrades to a text header if the file is absent (mailer.ts:119) |
| Unresolved `{placeholder}` | **impossible** — asserted per locale (`:32`, `:51`, `:60`, `:96`) |
| Locale | `sendFeedbackLinkForRecord` never passes one → always `DEFAULT_LOCALE` (he). Correct for a single Hebrew venue; a latent gap if the venue onboards English clients. |

**Status: VERIFIED,** and this is the best-tested part of the whole email path.

**GAP (deliverability, not correctness):** no `List-Unsubscribe` header, no
`Message-ID`/`References` control, no `Reply-To`. A transactional post-event survey
from a Gmail account to a customer who just did business with the venue is low-risk,
but `List-Unsubscribe` is now effectively expected by Gmail/Yahoo bulk rules and is
a two-line addition.

---

## 11. Security

| Check | Finding |
|---|---|
| Secrets in code | **None.** Credentials read from `process.env` at call time. |
| Secrets in logs | **None.** No password, token or message body is logged. |
| Token in logs | **No** — the dispatcher logs `feedbackId`, not `token` (feedbackHelpers.ts:400) |
| Recipient address in logs | **Yes** — `deliverMail` logs `… → ${mailOptions.to}` (mailer.ts:171, :177) and the label embeds the address. Customer PII in application logs. Low severity, but worth masking. |
| Survey token | `crypto.randomUUID()` — CSPRNG, 122 bits (feedbackHelpers.ts:307) |
| Token expiry | **NONE.** A survey link is valid forever. Previously reported; still open. |
| Token in URL | unavoidable for a one-click survey; mitigated by single-use submission |
| HTML injection into the mail | client name is interpolated unescaped into the HTML body (mailer.ts:432). The value comes from staff-entered booking data, not from the public, and the blast radius is the customer's own inbox — but it should be escaped. |
| Cross-tenant leak via email | none — recipients derive from a tenant-scoped booking read |
| Admin send authz | `requireAuth` + `requireRole(RBAC.FEEDBACK_ADMIN)` + tenant-scoped `findFirst` → another tenant's booking is a 404 (feedback.controller.ts:417). **VERIFIED**, covered by `feedbackHttp.tenantIsolation.test.ts`. |

---

## 12. Webhooks / bounce handling

**MISSING — nothing exists.**

`grep -rn "bounce|complaint|dsn|Message-ID"` over `server/src` returns only WhatsApp
and EasyCount hits. There is:

* no bounce webhook,
* no complaint/spam-report handling,
* no suppression list,
* no per-address delivery status beyond `lastEmailSent` (which means *"SMTP accepted
  it"*, not *"it reached the inbox"*).

This is inherent to raw Gmail SMTP: Google returns a bounce as an email to the
sending mailbox, which nothing in this system reads. Consequence: a wrong customer
address is recorded as **sent** and counted in `responseRate`'s denominator forever.
The project *does* have working webhook infrastructure (`middlewares/webhookHmac.ts`,
`whatsapp/webhookEvent.service.ts`), so the pattern is available if an API-based
provider is adopted.

---

## 13. Observability

| Signal | Present |
|---|---|
| Boot-time SMTP verification | **Yes** — `verifyEmailConnection()` at server.ts:40, logs the classified reason |
| Per-recipient success | `Feedback link sent` + tenantId/bookingId/feedbackId/clientSide/channel flags |
| Per-recipient failure | `Feedback link not delivered` + reasons + attempt number |
| Transport throw | `Feedback delivery threw` + error message |
| Per-run summary | `Feedback sweep finished` + counts, plus a Hebrew cron summary line |
| Persisted failure reason | `lastNotifyError` on the row — queryable, survives restarts |
| Error reporting to Sentry / alert webhook | **Yes** — `reportIntegrationFailure('email', …)` on both verify and send failure (mailer.ts:110, :182) |
| Health endpoint | `/health/ready` → `checks.email` |
| **Metric / alert on "N surveys parked"** | **MISSING** |
| **Alert when email is unconfigured** | **MISSING** — `skipped` does not degrade aggregate health |

**Status: PARTIAL.** Diagnosis after the fact is well served; nobody is *told*
when delivery stops working.

---

## 14. Test coverage

| Area | Coverage |
|---|---|
| Message content, both locales, no unresolved placeholders | **13 tests** — `feedbackMessages.test.ts` |
| Dispatch, claim, concurrency, retry, isolation | **16 tests** — `feedbackDispatch.test.ts` |
| Schedule / due-time rules incl. DST | **25 tests** — `feedbackSchedule.test.ts` |
| Statistics | **13 tests** — `feedbackStats.test.ts` |
| HTTP tenant isolation | **17 tests** — `feedbackHttp.tenantIsolation.test.ts` |
| Failure reporting to Sentry/webhook | `reportIntegrationFailure.test.ts` |
| **`deliverMail` itself** | **NO DIRECT TEST** — the simulation branch, `sanitizeMailAttachments`, and `classifyMailError` (`EAUTH`/535 → `auth_failed`) are exercised only indirectly |
| **Real SMTP send** | none, by design |

**Status: PARTIAL.** The gap is narrow and cheap to close: a `mailer.deliverMail`
unit test with a fake transport covering (a) unconfigured → `{ok:true,simulated:true}`
and no transport call, (b) `EAUTH` → `{ok:false,reason:'auth_failed'}`, (c) a
non-existent attachment path being stripped rather than throwing.

---

## 15. Real-provider test — **UNVERIFIED, and here is how to close it**

Not performed: no outbound SMTP from either sandbox (`EAI_AGAIN`, §3), and no test
mail may be sent to a real customer. Run this **on the production host**, where it
authenticates against Gmail and sends **nothing**:

```bash
docker exec maple-server node -e "
const n=require('nodemailer');
n.createTransport({service:'gmail',auth:{user:process.env.EMAIL_USER,
  pass:(process.env.EMAIL_PASS||'').replace(/\s+/g,'')}})
 .verify().then(()=>console.log('SMTP OK'))
 .catch(e=>console.log('SMTP FAIL',e.code,e.responseCode));"
```

Then, for an end-to-end proof that costs no customer anything, use
`POST /api/feedback/admin/send` against a **test booking whose client email is a
mailbox you own**, and confirm `emailSent: true` in the response plus a stamped
`lastNotifiedAt`. Do not point it at a real customer.

---

## 16. Failure matrix

| Failure | Detected? | Behaviour | Customer impact | Verdict |
|---|---|---|---|---|
| `EMAIL_USER`/`EMAIL_PASS` unset | boot log + `/health/ready` `skipped` | silently simulates; nothing counted as sent; rows stay retryable and eventually PARK | **no survey ever arrives**, and no alarm | **GAP** |
| Wrong App Password | boot `verify()` + `reportIntegrationFailure` | `auth_failed`, reason persisted, 5 retries, then PARKED | no survey | PARTIAL (retries a permanent error) |
| Gmail rate/quota limit hit | `unknown` reason persisted | retried hourly ×5, then PARKED | delayed, possibly lost after 5 h | PARTIAL |
| SMTP connection hangs | no timeout override | sweep blocks up to ~10 min | delayed | **GAP** |
| Customer address invalid / bounces | **not detected at all** | recorded as **SENT**, terminal | never asked; skews `responseRate` | **MISSING** (§12) |
| Customer has no email but has a phone | yes | WhatsApp carries it; `lastEmailSent=false` | fine | VERIFIED |
| Customer has neither channel | yes | never counted as sent; `lastNotifyError` set | correctly excluded from stats | VERIFIED |
| Transport throws mid-sweep | yes | that recipient fails, the rest continue | isolated | VERIFIED |
| Two workers / two replicas overlap | n/a | CAS claim admits one | exactly one email | VERIFIED |
| Two admins click "send" simultaneously | no | claim bypassed, no rate limit | **two identical emails** | **GAP** (§6) |
| DB write fails after a successful send | no | at-least-once: one duplicate on a later tick | duplicate, never a loss | acceptable by design |
| `CLIENT_URL` left at localhost | yes — `logger.warn` + a Hebrew warning in the admin response | link unusable externally | prod compose forces the public URL | VERIFIED |

---

## 17. Readiness score

| Dimension | Score | Note |
|---|---|---|
| Correctness of the message | 10/10 | exported, asserted in both locales, HTML + text |
| Idempotency (automatic path) | 10/10 | DB-level CAS, proven under concurrency |
| Idempotency (manual path) | 5/10 | claim bypassed, no rate limit |
| Worker reliability | 8/10 | isolation verified; no transport timeouts |
| Retry policy | 7/10 | bounded and sane; fixed backoff, permanent errors retried |
| Configuration safety | **4/10** | unconfigured email fails **silently** in production |
| Deliverability feedback (bounces) | **1/10** | none |
| Security | 8/10 | no secret leakage; tokens never expire, recipient PII logged, name unescaped in HTML |
| Observability | 6/10 | rich logs, no alerting on delivery going dark |
| Test coverage | 8/10 | excellent around the message and the dispatcher; `deliverMail` untested |
| Provider resilience | **3/10** | single Gmail SMTP account, no fallback, consumer-grade quota |

**Overall: 6.4 / 10 — functional and safe, operationally fragile.**

---

## 18. Blockers and recommendations

**B-1 — Silent misconfiguration (fix before the next production deploy).**
Add email to `validateEnv()` with the same shape as the WhatsApp check: if a new
`EMAIL_ENABLED`/`NODE_ENV=production` is set and `EMAIL_USER`/`EMAIL_PASS` are not,
log critical and refuse to boot — or, at minimum, make `checks.email === 'skipped'`
**degrade** the aggregate health status so the alert fires. Today a forgotten
variable means every customer survey silently evaporates and every dashboard shows
"0 sent", which is indistinguishable from "no events".

**B-2 — Single consumer Gmail account (fix before scale, not before launch).**
Gmail SMTP with an App Password is ~500 messages/day, has no bounce feedback, no
delivery API, and one revoked password from total outage. For one venue's survey
volume it works. It is not a platform on which to onboard a second tenant. Migrating
to an API provider (SES/Postmark/Resend) also unlocks §12 entirely, and the codebase
already has HMAC webhook middleware to receive the events.

**Recommended, non-blocking**, in descending value:

1. Bounce/complaint handling + a suppression list (requires B-2).
2. Explicit transport timeouts and `pool: true` (§7).
3. Apply the CAS claim + `feedbackLimiter` to `POST /admin/send` (§6).
4. Park immediately on `auth_failed` / SMTP 5.1.1 instead of burning five attempts (§8).
5. A survey-token TTL (carried over from the earlier audit; still open).
6. `deliverMail` unit tests — simulation branch, `auth_failed` classification,
   attachment sanitisation (§14).
7. `tenantId` on the two post-send `updateMany` calls (§9).
8. Escape the client name interpolated into the email HTML (§11).
9. `List-Unsubscribe` and `Reply-To` headers (§10).
10. Mask recipient addresses in logs (§11).

---

## 19. Final verdict

**Can the review-email delivery system be deployed for real customers? — YES, conditionally.**

The delivery *logic* is production-grade: rows are created before sending, every
recipient is claimed atomically so duplicates are structurally impossible, failures
are isolated per tenant / per booking / per recipient, retries are bounded, the
message itself is asserted in both locales, and — importantly — an unconfigured
mailer is never counted as a successful send.

The weakness is not the code path, it is the *operational envelope*: one consumer
Gmail account, no bounce feedback, and a configuration mistake that fails silently
instead of loudly.

**Condition for deployment:** close **B-1** (fail loudly, or at least alert, when
email is not configured), and run the `verify()` command in §15 on the production
host so that "SMTP authenticates" stops being **UNVERIFIED**. With those two done,
this is safe to run for real customers at one-venue volume.

**Not verified in this audit, and not to be read as passing:** that Gmail accepts
the production credential; that mail from this account actually lands in customer
inboxes rather than spam; and any real end-to-end send.
