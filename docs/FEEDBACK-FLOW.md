# Post-Event Feedback — Flow, Rules and Operations

This document is the contract for the post-event customer feedback flow. It records
the decisions the code now enforces, so they are not re-litigated by accident.

## 1. End-to-end chain

```
EVENT (Booking + EventDate)
  → event END datetime            eventStart.getEventEndDateTime  (overnight-aware)
  → due at                        feedbackSchedule.feedbackDueAt   (event day + 1 @ send hour)
  → sweep                         cronJobs → feedbackHelpers.processDueFeedback   (FEEDBACK_CRON)
  → per tenant, per booking       findFeedbackCandidates (tenant-scoped, windowed)
  → recipients                    feedbackHelpers.buildFeedbackSides (A, and B for dual-side types)
  → survey rows + tokens          ensureFeedbackRecordsForBooking (createMany skipDuplicates)
  → atomic claim                  Feedback.updateMany CAS on lastNotifiedAt/notifyAttempts
  → email + WhatsApp              mailer.buildFeedbackRequestMail / whatsapp.buildFeedbackRequestWhatsAppMessage
  → survey page                   client /feedback/:token  →  GET  /api/feedback/:token
  → submission                    POST /api/feedback/:token (transactional single-use claim)
  → persistence                   Feedback row (ratings, comments, completedAt)
  → statistics                    feedbackStats.* via GET /api/feedback/admin/stats
  → dashboard                     client Dashboard + FeedbackStats
```

## 2. Timing rules

**Event end datetime.** The end clock-time comes from the booking slot
(`timeOfDay`, stored as `slot|HH:MM - HH:MM`). An event whose end clock-time is at
or before its start clock-time ends on the **following** civil day:

| Slot | End instant |
|---|---|
| `22:00 - 23:00` | same day 23:00 |
| `18:00 - 00:00` | next day 00:00 |
| `19:00 - 01:00` | next day 01:00 |
| `23:30 - 02:00` | next day 02:00 |
| `08:00 - 12:00` | same day 12:00 |

**Next-day rule.** A survey becomes due on the civil day **after the event**, at
`FEEDBACK_SEND_HOUR` (default 10:00) local time. The event's civil day is derived
from its real end datetime, with a night rollover: an event ending before
`FEEDBACK_NIGHT_ROLLOVER_HOUR` (default 05:00) belongs to the previous civil day.
So a wedding running Monday 19:00 → Tuesday 01:00 is a *Monday* event and its
surveys go out Tuesday at 10:00 — not Wednesday.

**Archive independence.** Nothing in the feedback flow reads `EventDate.status` to
decide eligibility. The nightly archive job (`ARCHIVE_CRON`, default 00:00) flips
past events `BOOKED → ARCHIVED`; the feedback sweep accepts both statuses. The two
jobs therefore touch disjoint state and there is no midnight race, regardless of
which one runs first.

**Catch-up.** The sweep runs on `FEEDBACK_CRON` (default hourly). If the server is
down at the due moment, the next run picks the event up. The scan window is
`FEEDBACK_LOOKBACK_DAYS` (default 14) — long enough for a realistic outage, short
enough that a fresh deployment never mass-mails historical events.

## 3. Timezone policy

* The venue operates in **one** civil timezone; the server process must run in it.
  `TZ=Asia/Jerusalem` is set in `docker-compose.prod.yml`.
* All calendar arithmetic uses **local civil time** via `utils/dateLocal.ts`
  (`localStartOfDay`, `addCalendarDays`, `parseCalendarDate`). Never
  `new Date('YYYY-MM-DD')` and never `toISOString().split('T')[0]`.
* `EventDate.date` is stored at **local noon** so a civil date survives any UTC
  conversion.
* Timestamps that mark *instants* (`lastNotifiedAt`, `completedAt`,
  `lastNotifyAttemptAt`) are ordinary UTC instants — only the calendar decisions
  are civil-local.
* **The database is intentionally UTC** (`SHOW TimeZone` → `Etc/UTC`): Prisma stores
  `DateTime` as UTC and no calendar decision is ever made in SQL. The pairing that
  matters is *application process in the venue timezone, database in UTC*; verified
  in the end-to-end run, which prints both.
* DST: because every boundary is computed with local `Date` constructors rather
  than by adding 24h of milliseconds, the send hour stays 10:00 local across both
  DST transitions. Covered by tests in `server/tests/feedbackSchedule.test.ts`.

### Token generation

Survey tokens are RFC 4122 v4 UUIDs from `crypto.randomUUID()` (Node's CSPRNG).
The `uuid` npm package is deliberately not used here: it is ESM-only from v14, and
the project's jest `transform` only covers `.ts`, so importing it made the whole
module untestable under jest.

## 4. Recipients

* Side **A** is always the primary client, when a phone or email exists.
* Side **B** is added only for dual-side event types (`חתונה`, `אירוסין`) **and**
  only when side B has both a name and at least one contact channel.
* Each side is a separate `Feedback` row with its own token, ratings, comments and
  completion state, guaranteed distinct by `@@unique([bookingId, clientSide])`.
* `contactForSide` returns contact details only for a recognised side; an unknown
  side yields no contact rather than falling back to the other party.

## 5. Delivery state machine

```
(no row) --ensureFeedbackRecordsForBooking--> PENDING (notifyAttempts=0)
PENDING --claim (CAS)--> ATTEMPTING (notifyAttempts+1, lastNotifyAttemptAt=now)
ATTEMPTING --delivered--> SENT      (lastNotifiedAt set — terminal, never re-sent)
ATTEMPTING --failed-----> PENDING   (lastNotifyError set; retryable after backoff)
PENDING --attempts >= FEEDBACK_MAX_NOTIFY_ATTEMPTS--> PARKED (manual re-send only)
SENT --customer submits--> COMPLETED (isCompleted, completedAt)
```

The claim is a conditional `UPDATE` (compare-and-set) on
`lastNotifiedAt IS NULL AND notifyAttempts < max AND (lastNotifyAttemptAt IS NULL OR
lastNotifyAttemptAt <= now - backoff)`. Exactly one caller can win a row per backoff
window, so duplicate or overlapping worker runs — including two server instances —
cannot deliver the same recipient twice. A retry never creates a second survey row
or a second token, because rows are created before any delivery is attempted.

## 6. Tenant isolation

Every feedback query is tenant-scoped server-side:

| Operation | Scoping |
|---|---|
| `GET /api/feedback/admin/list` | `booking.tenantId = req.user.tenantId` |
| `GET /api/feedback/admin/stats` | both the feedback and the booking query |
| `POST /api/feedback/admin/send` | `findFirst({ id, tenantId })` — another tenant's booking is a 404 |
| Worker candidate query | per-tenant loop, `tenantId` in every `where` |
| Delivery claim | `tenantId` in the `where` |
| `GET`/`POST /api/feedback/:token` | the (globally unique) token *is* the credential; tenancy is derived from the row and never taken from the request |

## 7. Statistics counting rule

The unit of measurement is a **response** — one recipient (`clientSide`) of one
event — not an event. A wedding has two recipients, so it contributes up to two
surveys sent and two responses, each weighing the same as any other response in the
averages.

* `responseRate = responses received / surveys actually SENT`
* `coverageRate = responses received / every recipient a finished event has`
  (an operational metric: it also penalises events where nothing was sent)

There are **no maintained counters**. Every figure is derived from the persisted
`Feedback` rows on each request by `utils/feedbackStats.ts`, so a submitted response
is reflected immediately and cannot drift. Statistics never filter on
`EventDate.status`, so archiving an event never removes its responses from the KPIs.

Rating scale is **1–5** on every layer: UI stars, the zod validator
(`int().min(1).max(5)`), the `Int` columns, and the aggregation.

## 8. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `TZ` | `Asia/Jerusalem` | Civil timezone for all calendar decisions. **Must** be the venue's. |
| `FEEDBACK_CRON` | `0 * * * *` | Sweep schedule (idempotent; may run as often as you like). |
| `FEEDBACK_SEND_HOUR` | `10` | Local hour at which the previous day's surveys go out. |
| `FEEDBACK_NIGHT_ROLLOVER_HOUR` | `5` | Events ending before this belong to the previous civil day. |
| `FEEDBACK_LOOKBACK_DAYS` | `14` | How far back the sweep looks (bounds catch-up and the backlog). |
| `FEEDBACK_MAX_NOTIFY_ATTEMPTS` | `5` | Delivery attempts before a recipient is parked. |
| `FEEDBACK_RETRY_BACKOFF_MINUTES` | `60` | Minimum wait between attempts for one recipient. |
| `ARCHIVE_CRON` | `0 0 * * *` | Nightly archive job (independent of feedback). |
| `CLIENT_URL` | — | Public base URL used to build survey links. Must not be localhost in production. |
| `EMAIL_USER` / `EMAIL_PASS` | — | SMTP credentials. **Required in production** (see §8.1). Elsewhere the mailer *simulates* and delivery is correctly **not** counted as sent. `EMAIL_PASSWORD` is accepted as a legacy alias for `EMAIL_PASS`. |

### 8.1 Email configuration states

There is deliberately **no `EMAIL_ENABLED` switch**: post-event feedback is a core
product feature, so a production server that cannot send mail is a misconfiguration,
never an intentional mode. One rule — `config/emailConfig.describeEmailConfig()` —
is used by boot validation, by the readiness check and by the transport, so the
three can never disagree (notably about the legacy `EMAIL_PASSWORD` spelling).

| State | Condition | Boot | `/health/ready` → `checks.email` | Aggregate | Delivery |
|---|---|---|---|---|---|
| **configured** | user + password present | starts | `ok` — `configured` | `ok` | real SMTP send |
| **unavailable** | production, credential missing | starts, **`CRITICAL` error in the log** | `down` | `degraded` | simulated — **never counted as sent**, rows stay retryable |
| **simulated** | non-production, credential missing | starts, warns | `skipped` | `ok` | logged only; **never counted as sent**, row stays retryable |
| **intentionally disabled** | — | not supported by design | — | — | — |

The server deliberately **does not refuse to boot** without a mailer: bookings,
contracts and payments must not go down over a mail credential. The failure is made
loud instead of fatal, in two places — the boot log, and readiness. **Monitoring must
alert on `/health/ready`**, because a boot log can be scrolled past.

A `skipped` check does not move the aggregate status — that is exactly how a
silently simulating production mailer used to look identical to a healthy one, and
why the production case is `down` rather than `skipped`. A non-database dependency
reporting `down` now yields overall `degraded`; it never returns 503, because the
process is still serving traffic.

Recovery needs no code change and no restart of the delivery logic: set the
variables, restart the server, and the next sweep picks up every recipient that was
left retryable (bounded by `FEEDBACK_LOOKBACK_DAYS`).

**Verifying the credential** — authenticates against Gmail and sends nothing:

```bash
docker exec maple-server node -e "
const n=require('nodemailer');
n.createTransport({service:'gmail',auth:{user:process.env.EMAIL_USER,
  pass:(process.env.EMAIL_PASS||'').replace(/\s+/g,'')}})
 .verify().then(()=>console.log('SMTP OK'))
 .catch(e=>console.log('SMTP FAIL',e.code,e.responseCode,e.message));"
```

Four distinct states this distinguishes: *configuration exists* (the boot check),
*connection works* (no `EDNS`/`ETIMEDOUT`), *authentication works* (`SMTP OK`, no
`EAUTH`/535), and *delivery works* — only a real send to a mailbox you own proves
the last one.

## 9. Operating notes

* "Did last night's surveys go out?" — search the logs for `Feedback sweep finished`
  (counts per run) and `Feedback link sent` / `Feedback link not delivered`
  (per recipient, with `tenantId`, `bookingId`, `feedbackId`, `clientSide`). Tokens,
  credentials and message bodies are never logged.
* A recipient stuck in `PENDING` with `notifyAttempts = FEEDBACK_MAX_NOTIFY_ATTEMPTS`
  needs a manual re-send from the feedback manager; `lastNotifyError` says why it
  failed.
* Manual re-send works for `ARCHIVED` events too — that is deliberate.
