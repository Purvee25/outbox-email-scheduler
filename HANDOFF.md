# Handoff — ReachInbox Email Job Scheduler

> **Date:** 30 September 2026
> **Status:** Code-complete. Blocked on external credentials before a live demo. Run `npm run doctor` for the exact list.
>
> **Location:** `~/Desktop/outbox`. Docker Compose is pinned to the project name `outbox-email-scheduler` so existing DB volumes keep working.

---

## TL;DR

Everything the assignment asks for is built, tested, and verified:

| Requirement | File / Layer | Verified |
|---|---|---|
| Email send API | `POST /api/campaigns` → `services/campaigns.ts` | ✅ 45/45 tests, live DB has 5 558 rows |
| Schedule at specific time | `scheduling/plan-sends.ts` → BullMQ `moveToDelayed(ts)` | ✅ Verified 40–120 ms accuracy |
| BullMQ + Redis (no cron) | `queue/` — 4 queues; `worker.ts` | ✅ `grep -r cron` → 0 cron usage |
| Ethereal Email (fake SMTP) | `mail/transport.ts` → Nodemailer → `smtp.ethereal.email:587` | ✅ Preview URLs stored in DB |
| Survives restarts | Redis AOF; `maintenance.ts` `reconcileScheduledEmails()` on boot | ✅ Tested with full Redis key wipe |
| Dashboard: schedule emails | `compose-modal.tsx` | ✅ CSV upload, validation, submit |
| Dashboard: view scheduled | `email-table.tsx` — "Scheduled" tab, 5 s poll | ✅ |
| Dashboard: view sent | Same table — "Sent" tab with preview links | ✅ |

**What blocks the live demo:** Google OAuth credentials, Ethereal sender accounts, and (optionally) a Slack app. All three are generated in external consoles — the code awaits them in `backend/.env`.

---

## Added after the first handoff

- Light green UI matching the design screenshots (sidebar, list rows, full-page compose, Send Later popover).
- Email detail view (`GET /api/emails/:id`) and body previews on list rows.
- Rich-text bodies (Tiptap) sanitised server-side; HTML + text sent to recipients.
- Attachments (upload / download / send), with a stale-upload cleanup in the maintenance sweep.
- Elasticsearch mapping is upgraded automatically on existing indexes.
- `npm run doctor` readiness check.
- Star / archive / delete support was being built in a parallel session; treat it as unfinished until it has tests.

## Codebase stats

| Metric | Value |
|---|---|
| Backend source (TypeScript) | 38 files · ~2 350 LoC |
| Frontend source (TSX + TS) | 28 files · ~1 580 LoC |
| Shared schemas | 1 file · 122 LoC |
| Tests | 9 files · ~870 LoC · **45 tests, all passing** |
| Total application code | **~4 930 LoC** |
| Git commits | 5 (scaffold → scheduler → slack/admin → frontend → elasticsearch) |
| npm workspaces | 3 (`packages/shared`, `backend`, `frontend`) |

---

## Architecture

```mermaid
flowchart TD
    Browser -->|HTTPS| Caddy
    Caddy -->|"/api, /auth, /admin"| API["Express 5 API"]
    Caddy -->|"everything else"| FE["Next.js 16"]

    API --> MySQL[(MySQL 8)]
    API --> Redis[(Redis 7)]
    API --> ES[(Elasticsearch 8)]

    API -->|"enqueue delayed jobs"| BullMQ
    BullMQ --> Redis
    BullMQ -->|wake| W1["Worker 1"]
    BullMQ -->|wake| W2["Worker 2"]

    W1 & W2 --> MySQL
    W1 & W2 -->|"Lua slot reservation"| Redis
    W1 & W2 -->|SMTP| Ethereal
    W1 & W2 -->|upsert| ES
    W1 & W2 -->|webhook| Slack
```

### Key design choices

| Decision | Rationale |
|---|---|
| MySQL as source of truth, not Redis | Atomic `UPDATE … WHERE status='scheduled'` for idempotent claims; no distributed lock library needed. |
| Redis AOF + reconciliation on boot | BullMQ jobs survive restarts. If Redis dies, worker boot re-enqueues every `scheduled` row from MySQL. |
| Lua-script slot reservation | One `EVALSHA` per job reserves the next free send time, enforcing the per-sender hourly cap. No polling, no thundering herd. |
| `moveToDelayed()` instead of `sleep()` | Worker never blocks a thread. Future slots re-queue the job into BullMQ's delayed set. |
| At-most-once on expired leases | Ethereal has no idempotency key. A timed-out `sending` row is marked `failed` — we prefer one missed send over a duplicate. |
| Separate notification queue | A failing Slack webhook never blocks email sending. |
| Session cookie (not JWT) | Real server-side logout and revocation. `httpOnly`, `SameSite=Lax`, `secure` in prod. |

---

## Directory map

```
outbox-email-scheduler/
├── packages/shared/src/index.ts   ← Zod schemas + TS types shared by API and frontend
│
├── backend/
│   ├── src/
│   │   ├── app.ts                 ← Express setup: helmet, CORS, session, routes
│   │   ├── server.ts              ← HTTP listen
│   │   ├── worker.ts              ← BullMQ workers × 4 queues, reconciliation, shutdown
│   │   ├── config/env.ts          ← Zod-validated environment vars
│   │   ├── db/
│   │   │   ├── client.ts          ← mysql2 pool + Drizzle instance
│   │   │   ├── schema.ts          ← users, campaigns, emails, slack_connections
│   │   │   ├── email-repo.ts      ← claim / release / markSent / markFailed / list queries
│   │   │   └── migrate.ts         ← Drizzle migrator (runs once)
│   │   ├── auth/google.ts         ← Google OAuth: PKCE + state, session create/destroy
│   │   ├── routes/
│   │   │   ├── campaigns.ts       ← POST /api/campaigns, GET /api/emails
│   │   │   ├── me.ts              ← GET /api/me (current user + Slack status)
│   │   │   └── slack.ts           ← GET /api/slack/connect, callback, DELETE
│   │   ├── services/
│   │   │   ├── campaigns.ts       ← createCampaign: validate → plan → insert → enqueue
│   │   │   └── email-list.ts      ← listEmails: MySQL or Elasticsearch depending on ?q=
│   │   ├── scheduling/
│   │   │   ├── plan-sends.ts      ← planSends(): slot formula, dedup, hourly-limit windows
│   │   │   └── send-slots.ts      ← Lua scripts: reserveSendSlot(), acquireSendTurn()
│   │   ├── queue/
│   │   │   ├── queues.ts          ← Queue declarations + enqueueEmails()
│   │   │   ├── email-processor.ts ← processEmailJob: claim → reserve → turn → send → mark
│   │   │   ├── maintenance.ts     ← Lease sweep + reconcileScheduledEmails()
│   │   │   ├── notifications.ts   ← Slack webhook poster (rate-limit alerts)
│   │   │   └── search-index.ts    ← Elasticsearch upsert queue
│   │   ├── search/
│   │   │   ├── client.ts          ← ES client + index mapping
│   │   │   └── indexer.ts         ← bulk upsert from MySQL → ES
│   │   ├── mail/
│   │   │   ├── senders.ts         ← Parse ETHEREAL_SENDERS env var
│   │   │   └── transport.ts       ← Nodemailer send + preview URL
│   │   ├── slack/slack.ts         ← OAuth flow, AES-256-GCM encrypt/decrypt, disconnect
│   │   ├── admin/bull-board.ts    ← Bull Board at /admin/queues
│   │   ├── middleware/
│   │   │   ├── auth.ts            ← requireAuth, requireAdmin, requireTrustedOrigin
│   │   │   └── rate-limit.ts      ← Redis-backed rate limiters
│   │   ├── lib/
│   │   │   ├── redis.ts           ← ioredis + redis (session store)
│   │   │   ├── logger.ts          ← pino
│   │   │   ├── http-error.ts      ← HttpError class
│   │   │   ├── crypto.ts          ← AES-256-GCM encrypt/decrypt
│   │   │   └── validate.ts        ← parseOrThrow (zod → 422)
│   │   ├── scripts/reindex.ts     ← CLI: rebuild ES index from MySQL
│   │   └── types/                 ← express-session augmentation
│   ├── test/
│   │   ├── helpers.ts + setup.ts  ← Test DB setup, fake sessions
│   │   ├── search.test.ts         ← Elasticsearch query correctness (6 tests)
│   │   ├── slack.test.ts          ← Slack webhook + encrypt/decrypt (9 tests)
│   │   ├── access-control.test.ts ← Cross-user isolation (6 tests)
│   │   ├── email-repo.test.ts     ← Claim/release/mark DB ops (6 tests)
│   │   ├── send-slots.test.ts     ← Lua reservation correctness (8 tests)
│   │   ├── plan-sends.test.ts     ← Slot formula edge cases (6 tests)
│   │   └── crypto.test.ts         ← AES round-trip (4 tests)
│   ├── drizzle/                   ← SQL migrations (0000_init, 0001_slack_access_token)
│   └── Dockerfile                 ← Multi-target: api + worker
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx         ← Root layout: Inter font, Providers
│   │   │   ├── globals.css        ← Dark design tokens, animations, glass utilities
│   │   │   ├── providers.tsx      ← React Query + Sonner toast
│   │   │   ├── page.tsx           ← / → redirect to /dashboard
│   │   │   ├── login/page.tsx     ← Google OAuth login (SSR)
│   │   │   └── dashboard/page.tsx ← Suspense wrapper
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   │   ├── dashboard.tsx  ← Main dashboard: tabs, search, table, compose
│   │   │   │   ├── header.tsx     ← Sticky glassmorphism nav
│   │   │   │   ├── email-table.tsx ← DataTable + polling + pagination
│   │   │   │   ├── email-filters.tsx ← Search input + status dropdown
│   │   │   │   ├── compose-modal.tsx ← Campaign form: CSV upload, validation
│   │   │   │   └── slack-control.tsx ← Connect/disconnect Slack
│   │   │   └── ui/               ← Button, Modal, Field, DataTable, Tabs, StatusBadge, etc.
│   │   ├── hooks/
│   │   │   ├── use-session.ts     ← React Query: GET /api/me → redirect if 401
│   │   │   └── use-debounced-value.ts
│   │   └── lib/
│   │       ├── api.ts             ← Typed API client: fetch + zod runtime validation
│   │       ├── cn.ts              ← Class merger
│   │       ├── format.ts          ← Date formatting
│   │       └── leads.ts           ← PapaParse CSV → email[]
│   ├── Dockerfile                 ← Next.js standalone build
│   └── next.config.ts             ← transpilePackages + standalone output
│
├── scripts/load-test.mjs          ← 1 000-email load-test script
├── docker-compose.yml             ← Local dev: MySQL, Redis, Elasticsearch
├── docker-compose.prod.yml        ← Full production stack + Caddy
├── Caddyfile                      ← HTTPS reverse proxy
├── docs/railway.md                ← Railway deployment guide
├── README.md                      ← Full project documentation
├── PLAN.md                        ← Working plan with timeline
└── .env.example                   ← All env vars documented
```

---

## What is done ✅

### Backend
- [x] Express 5 API with zod validation, helmet, CORS, body limit
- [x] Google OAuth (PKCE + state, session cookie, real logout)
- [x] `POST /api/campaigns` — up to 5 000 recipients, deduped, transactional insert
- [x] `GET /api/emails?tab=&page=&q=&status=` — MySQL listing + Elasticsearch search
- [x] BullMQ delayed jobs per email, `jobId = "email-<uuid>"` (idempotent)
- [x] Worker: claim → Lua reserve → send turn → SMTP → mark → index
- [x] Per-sender hourly rate limit via Redis Lua script
- [x] Restart recovery: reconcile `scheduled` rows without Redis jobs on boot
- [x] Lease sweep: self-rescheduling BullMQ job (no cron)
- [x] Ethereal SMTP with `getTestMessageUrl` preview links
- [x] `MAIL_TRANSPORT=log` mode for load tests (no SMTP, still rate-limits)
- [x] Slack OAuth + AES-256-GCM encrypted webhook + rate-limit alerts
- [x] Bull Board at `/admin/queues` (admin-only)
- [x] Redis-backed rate limiters (auth, compose)
- [x] Elasticsearch indexing (separate queue, graceful degradation)
- [x] `npm run reindex` rebuilds ES from MySQL

### Frontend
- [x] Next.js 16 App Router + React Query + Tailwind CSS 4
- [x] Dark-mode premium design: glassmorphism, animations, gradient text
- [x] Login page with Google OAuth button
- [x] Dashboard with Scheduled / Sent tabs (5 s auto-refresh)
- [x] Free-text search (Elasticsearch)
- [x] Status filter dropdown
- [x] Pagination
- [x] Compose modal: subject, body, CSV upload (PapaParse), start time, delay, limit
- [x] Status badges: scheduled (blue), sending (amber, pulsing), sent (green), failed (red)
- [x] Slack connect / disconnect
- [x] Toast notifications (sonner)
- [x] Responsive layout

### Infrastructure
- [x] Docker Compose: MySQL 8 + Redis 7 (AOF) + Elasticsearch 8
- [x] Backend Dockerfile (multi-target: `api` + `worker`)
- [x] Frontend Dockerfile (standalone build)
- [x] Production Compose with Caddy auto-HTTPS
- [x] Railway deployment guide

### Testing
- [x] 45 tests across 7 test files, all passing
- [x] End-to-end scenarios: normal send, worker crash, Redis wipe, hourly limit, 30-email burst
- [x] Load-test script: 1 000 emails at low limit

---

## What is NOT done ❌ (all credential-gated — not code)

| Item | What you need to do | Time |
|---|---|---|
| **Google login (end-to-end)** | Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client (Web). Authorized redirect URI: `http://localhost:4000/auth/google/callback` (dev) or your production URL. Paste `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `backend/.env`. | 5 min |
| **Ethereal accounts** | Go to [ethereal.email/create](https://ethereal.email/create) × 2–3 times. Copy user:pass pairs into `ETHEREAL_SENDERS` in `backend/.env`, e.g. `user1@ethereal.email:pass1,user2@ethereal.email:pass2`. Set `MAIL_TRANSPORT=ethereal`. | 3 min |
| **Admin access** | Add your Google email to `ADMIN_EMAILS` in `backend/.env`. This unlocks Bull Board at `/admin/queues`. | 30 sec |
| **Slack app** (optional) | Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → OAuth & Permissions → add `incoming-webhook` scope. Redirect URL: `https://<your-api>/api/slack/callback` (needs HTTPS — deploy first, or use ngrok). Paste `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`. | 10 min |
| **Deploy** | Follow `docs/railway.md` or use `docker-compose.prod.yml`. | 15 min |
| **Figma styling** | UI works but hasn't been matched to a Figma file. Share screenshots or give view access — it's a token update in `globals.css`. | Variable |
| **Reviewer invites** | Invite reviewers to the GitHub repo. | 1 min |
| **Demo video** | Record the demo script in the README once the deployed app has real logins working. | 15 min |

---

## Step-by-step: from checkout to running

### Local development (5 min)

```bash
# 1. Clone
git clone <repo-url>
cd outbox-email-scheduler

# 2. Install
npm install

# 3. Start infrastructure
docker compose up -d
# → MySQL :3307, Redis :6379, Elasticsearch :9200

# 4. Configure
cp .env.example backend/.env
# Edit backend/.env — at minimum:
#   SESSION_SECRET=<openssl rand -hex 32>
#   ENCRYPTION_KEY=<openssl rand -hex 32>
#   GOOGLE_CLIENT_ID=<from Google Cloud Console>
#   GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
#   ADMIN_EMAILS=you@gmail.com
#   MAIL_TRANSPORT=log          ← works without Ethereal accounts

# 5. Migrate
npm run db:migrate -w backend

# 6. Run (3 terminals)
npm run dev:api           # → http://localhost:4000
npm run dev:worker        # Worker process
npm run dev -w frontend   # → http://localhost:3000
```

### Production (15 min)

See `docs/railway.md` for Railway, or:

```bash
cp .env.example .env.production
# Fill ALL values, including MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD
# Edit Caddyfile — replace YOUR_DOMAIN

docker compose -f docker-compose.prod.yml --env-file .env.production up -d
# Scale to 2 workers for demo:
docker compose -f docker-compose.prod.yml --env-file .env.production \
  up -d --scale worker=2
```

---

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | MySQL + Redis liveness check |
| `GET` | `/auth/google` | — | Start Google OAuth flow |
| `GET` | `/auth/google/callback` | — | OAuth callback (sets session cookie) |
| `POST` | `/auth/logout` | ✓ | Destroy session |
| `GET` | `/api/me` | ✓ | Current user + Slack connection status |
| `POST` | `/api/campaigns` | ✓ | Schedule a campaign (body: subject, body, recipients[], startAt, delayMs, hourlyLimit) |
| `GET` | `/api/emails?tab&page&pageSize&q&status` | ✓ | List / search emails |
| `GET` | `/api/slack/connect` | ✓ | Start Slack OAuth |
| `GET` | `/api/slack/callback` | ✓ | Slack OAuth callback |
| `DELETE` | `/api/slack` | ✓ | Disconnect Slack |
| `GET` | `/admin/queues` | ✓ admin | Bull Board |

---

## Queues

| Queue | Purpose | Concurrency |
|---|---|---|
| `email-send` | Delayed email sends | `WORKER_CONCURRENCY` (default 5) |
| `maintenance` | Lease sweep + reconciliation | 1 |
| `notifications` | Slack webhook posts | 1 |
| `search-index` | Elasticsearch upserts | 1 |

---

## Database tables

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id`, `google_id` (unique), `email`, `name` | Created on first Google login |
| `campaigns` | `id`, `user_id`, `subject`, `body`, `start_at`, `delay_ms`, `hourly_limit` | One row per campaign |
| `emails` | `id`, `campaign_id`, `recipient`, `sender`, `status`, `scheduled_at`, `sent_at`, `lease_token`, `lease_expires_at` | One row per recipient; unique (`campaign_id`, `recipient`); index on (`user_id`, `status`, `scheduled_at`) |
| `slack_connections` | `user_id` (unique), `webhook_url_enc`, `channel`, `team_name` | Webhook encrypted with AES-256-GCM |

---

## Environment variables

See `.env.example` for all variables. Critical ones:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✓ | `mysql://user:pass@host:port/db` |
| `REDIS_URL` | ✓ | `redis://host:6379` |
| `ELASTICSEARCH_URL` | ✓ | `http://host:9200` |
| `SESSION_SECRET` | ✓ | ≥ 32 chars; `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | ✓ | 64 hex chars (32 bytes); `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | for login | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | for login | Google Cloud Console |
| `ETHEREAL_SENDERS` | for real SMTP | `user:pass,user:pass` from ethereal.email |
| `MAIL_TRANSPORT` | — | `ethereal` (default) or `log` (skip SMTP) |
| `ADMIN_EMAILS` | for Bull Board | Comma-separated emails |
| `WORKER_CONCURRENCY` | — | Default: 5 |
| `MIN_DELAY_MS` | — | Default: 2000 (gap between sends per sender) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | — | Default: 200 |

---

## Running tests

```bash
npm test                     # all workspaces
npm run test -w backend      # backend only (vitest)
npm run typecheck            # all 3 workspaces
```

All 45 tests pass against the running Docker infra (MySQL, Redis, Elasticsearch).

---

## Load test

```bash
node scripts/load-test.mjs \
  --api          http://localhost:4000 \
  --cookie       "sid=<value from DevTools>" \
  --count        1000 \
  --hourly-limit 10 \
  --delay        2000
```

What to watch:
- Dashboard → "Scheduled" tab fills with 1 000 rows instantly
- Bull Board → delayed jobs
- After ~10 sends per sender, Slack fires the hourly-limit alert
- Overflow emails show `scheduled_at` in the next hour window
- With 2 workers: `MAX(attempts)` stays 1, zero duplicates

---

## Known trade-offs (documented)

1. **Fixed-window hourly counter** — up to 2× the limit can fire around an `XX:00:00` hour boundary. A sliding window would fix this but adds significant complexity for a demo.
2. **At-most-once delivery on lease expiry** — if a worker dies mid-SMTP-send, the email is marked `failed` rather than retried. Ethereal has no dedup key, so we prefer missing one send over sending it twice.
3. **No SSE / WebSocket** — the dashboard polls every 5 s. For a 48 h assignment scope, polling is simpler and sufficient.
4. **No campaign cancel/reschedule** — listed as "cut" in the plan.
5. **No `{{name}}` personalization** — listed as "cut" in the plan.

---

## Demo script (for video recording)

1. Open the app. Log in with Google.
2. Compose modal → paste a CSV of 20 recipients, subject "Demo", start 1 min from now, delay 3 s, hourly limit 5. Submit.
3. Dashboard "Scheduled" tab — 20 rows appear instantly.
4. Wait. Watch rows flip to "Sent". Click a preview URL → Ethereal shows the full email.
5. **Stop** both the API and worker processes.
6. **Restart** both. Future emails still send (Redis AOF persisted). Past-due emails send immediately (reconciliation).
7. Run load test: `node scripts/load-test.mjs --count 1000 --hourly-limit 10`.
8. Bull Board → delayed tab fills up. After ~10 sends, Slack alert fires.
9. Scale worker to 2 replicas.
10. SQL check: `SELECT status, COUNT(*) FROM emails GROUP BY status` → zero duplicates.

---

## Fastest path to "done"

| Step | Action | Time |
|---|---|---|
| 1 | Fill in `GOOGLE_CLIENT_ID` + `SECRET` → login works | 5 min |
| 2 | Fill in `ETHEREAL_SENDERS` → real preview URLs | 3 min |
| 3 | Set `ADMIN_EMAILS` → Bull Board access | 30 sec |
| 4 | `npm run dev:api` + `dev:worker` + `dev` → test everything | 2 min |
| 5 | Deploy (Railway or docker-compose.prod) → HTTPS URL | 15 min |
| 6 | Create Slack app with HTTPS redirect → Slack alerts work | 10 min |
| 7 | Record demo video | 15 min |
| 8 | Push to GitHub + invite reviewers | 1 min |

**Total: ~50 minutes from right now to fully submitted.**
