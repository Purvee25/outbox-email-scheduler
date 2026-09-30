# Plan v2 — ReachInbox Email Job Scheduler

Revised after three independent reviews (backend correctness 6/10, hiring reviewer 7/10,
auth/security/frontend 5/10). This file is the working plan; the README is written at the end.

## Stack

| Layer             | Choice                                                                                                          | Why                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Monorepo          | npm workspaces: `backend/`, `frontend/`, `packages/shared/`                                                     | Shared zod schemas + types, no extra tooling                         |
| API               | Express 5 + TypeScript                                                                                          | Required                                                             |
| Worker            | Separate process, same codebase (`src/worker.ts`)                                                               | Scales horizontally; demo with 2 workers                             |
| Queue             | BullMQ on Redis (`appendonly yes`, `maxmemory-policy noeviction`)                                               | Required; noeviction so jobs are never evicted                       |
| DB                | MySQL 8 + Drizzle ORM (mysql2)                                                                                  | Job ad lists MySQL; Drizzle exposes `affectedRows` for atomic claims |
| Search            | Elasticsearch 8 (single node, 512 MB heap)                                                                      | Required                                                             |
| SMTP              | Nodemailer → Ethereal, pool of N sender accounts                                                                | Required                                                             |
| Auth              | Google OAuth in Express (`google-auth-library`, PKCE + state), `express-session` + Redis store, httpOnly cookie | API is the authority; real logout/revocation                         |
| Frontend          | Next.js App Router + Tailwind + React Query; tables poll every 5 s                                              | Required; polling beats SSE for 48 h scope                           |
| Validation / logs | zod (shared), pino, helmet                                                                                      |                                                                      |

## Data model

- `users` — id (uuid), google_id (unique), email, name, avatar_url
- `slack_connections` — user_id (unique), webhook_url_enc (AES-256-GCM), channel, team_name, connected_at
- `campaigns` — id, user_id, subject, body, start_at, delay_ms, hourly_limit (capped by env max)
- `emails` — id (uuid), campaign_id, user_id, recipient, sender, scheduled_at, status
  (`scheduled | sending | sent | failed`), attempts, message_id, preview_url, sent_at, error,
  lease_token, lease_expires_at; unique (campaign_id, recipient); index (user_id, status, scheduled_at)

## Scheduling

1. `POST /api/campaigns` validates (zod, ≤ 5 000 recipients, deduped), inserts campaign + email rows in one transaction.
2. Slot reservation at enqueue: email _i_ → `sender = senders[i % S]`,
   `scheduled_at = max(start + i·delay, start + floor(i / hourlyLimit)·1h + (i mod hourlyLimit)·delay)`.
   Order is preserved by construction.
3. Each row → BullMQ delayed job, `jobId = "email-<uuid>"` (string; also dedupes re-adds).

## Worker (per job, in this order)

1. **Claim**: `UPDATE emails SET status='sending', lease_token=?, lease_expires_at=now()+LEASE WHERE id=? AND status='scheduled'`.
   0 rows → already handled, complete job (idempotency).
2. **Reserve a send slot** (implemented; replaces the per-job gap lock): one Lua script per sender hands out
   the next free time — `max(now, nextFree)`, skipping any clock-hour window already at
   `MAX_EMAILS_PER_HOUR_PER_SENDER`, then `nextFree = slot + MIN_DELAY_MS`. One reservation per job, FIFO per
   sender, so a 1 000-email backlog drains in order without every job polling. A skipped window = hourly limit
   hit → Slack notification (block 3, deduped per sender per window).
3. **Send turn**: compare-and-set on the sender's last _actual_ send time. Reserved slots are exact, but jobs wake
   with a few ms of queue latency; without this guard a measured gap was 1 927 ms. Now always ≥ `MIN_DELAY_MS`.
4. Waiting (slot in the future or turn not yet free) → release claim (row shows the new time), keep the
   reservation in job data, `job.moveToDelayed(ts, token)`, `throw DelayedError`.
5. **Send** with a deterministic `Message-ID: <emailId@scheduler.local>`, SMTP timeouts < worker `lockDuration`.
6. **Mark** `sent` + message_id + preview_url, or on error: 5xx or attempts ≥ MAX → `failed`; otherwise back to
   `scheduled`, reservation dropped, BullMQ retry with backoff.
7. Index status change into Elasticsearch (failure logged + retried; `npm run reindex` rebuilds from MySQL).

Never sleep inside the processor; never re-add an active job.

### Verified end-to-end (block 2, `MAIL_TRANSPORT=log`)

| Scenario                                       | Result                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 6 emails, 1 s apart                            | all sent 40–120 ms after scheduled time, 1 attempt each, duplicate recipient removed                      |
| Worker killed, restarted before due            | all sent once                                                                                             |
| All Redis queue keys deleted while worker down | worker rebuilt jobs from MySQL on boot, all sent on time                                                  |
| Hourly limit 7/sender, 9 emails at once        | 5 sent immediately (2 s apart per sender), 4 moved to 17:00:00 / 17:00:02 and sent then, across a restart |
| 30 emails at once                              | per-sender min gap 2 006–2 009 ms                                                                         |
| All runs                                       | 55 sent, 0 duplicates, max attempts 1                                                                     |

## Restart & recovery

- Redis AOF persists delayed jobs; MySQL is the source of truth.
- On worker boot, reconcile: every `scheduled` row without a Redis job is re-enqueued with its original `scheduled_at`.
- Expired leases (`sending` past `lease_expires_at`) → **marked `failed` (unknown outcome), not resent**.
  Ethereal has no idempotency key, so we choose at-most-once over risking duplicates. Documented trade-off.
- Lease sweep runs as a self-rescheduling BullMQ delayed job — no cron anywhere.

## Load behaviour (documented in README)

1 000 emails, delay 2 s, limit 200/h/sender, 3 senders → slots spread per sender across windows;
runtime Lua check is a safety net if other campaigns share a sender. Fixed-window counter allows up to 2× the limit
around an hour boundary — documented trade-off.

## Slack

- "Connect Slack" → OAuth v2 with `incoming-webhook` scope, `state` stored in session (CSRF).
- Webhook URL stored AES-256-GCM encrypted (key from env). Disconnect deletes the row.
- Notifications run on a separate `notifications` queue. No connection → skip. 404/403 from Slack → mark disconnected, no crash.
  Reconnect works immediately (read from DB on every notification).

## Security

- Every query / ES search filtered by `req.session.userId`; senders never chosen by the client.
- Bull Board at `/admin/queues` behind `requireAuth` + `ADMIN_EMAILS` allowlist, read-only.
- helmet, CORS to one origin with credentials, `Origin` check on mutations, body limit 1 MB, auth/compose rate limits.
- Email bodies are plain text; previews never use `dangerouslySetInnerHTML`.

## Frontend

Reusable components: `Button`, `Input`, `Textarea`, `Modal`, `DataTable<T>`, `EmptyState`, `Skeleton`, `StatusBadge`, `Toast`, `Header`.
Pages: `/login`, `/dashboard` (Scheduled / Sent tabs + search), Compose modal (subject, body, CSV via Papa Parse with count, start time, delay, hourly limit).
Types come from `packages/shared`. Match the Figma — frames still needed.

## Hosting

One VM running docker compose + Caddy (auto-HTTPS) on a DuckDNS/sslip.io subdomain.
Frontend and API on the same site so the session cookie is `SameSite=Lax`. Provider choice pending.

## Timeline (48 h)

| Hours | Block                                                                                                            | Status                   |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 0–3   | Repo, docker compose, schema, Express skeleton, auth skeleton; you: Google + Slack apps, invite reviewers, Figma | done; your items pending |
| 3–14  | Scheduler, worker, limiter, idempotency, recovery, tests                                                         | done                     |
| 14–20 | Google login end-to-end, Slack connect/disconnect/alert                                                          | Slack + Bull Board + rate limits done; Google login needs your credentials |
| 20–32 | Frontend per Figma                                                                                               | built + verified in browser; Figma styling pending access |
| 32–36 | Elasticsearch indexing + search                                                                                  |                          |
| 36–40 | Deploy + load script                                                                                             |                          |
| 40–45 | README + Mermaid diagram + video                                                                                 |                          |
| 45–48 | Buffer                                                                                                           |                          |

## Cut

SSE, cancel/reschedule, campaign progress, `{{name}}` personalization, `/metrics`. Quota bars only if time remains.

## Demo script

Compose from UI → dashboard → stop API **and** worker → start → future email sends, zero-duplicates SQL →
1 000-email load script with low limit → Bull Board shows jobs moved to next window → live Slack message → two workers, limit holds.
