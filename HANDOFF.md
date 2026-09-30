# Handoff — ReachInbox Email Job Scheduler

> **As of:** 30 September 2026, evening. **Owner:** Purvee Singh (GitHub `Purvee25`).
> **Repo:** https://github.com/Purvee25/outbox-email-scheduler (private) · **Local:** `~/Desktop/outbox`
> **Last pushed commit:** `d2e6ce7` on `main`; working tree clean when this was written.
> **Status in one line:** code-complete and configured for a real demo (Google, Ethereal, Slack, tunnel). What remains is proving it live, recording the demo video, and submitting.

This file is the single source of truth for continuing the work in a new Claude session. Read it top to bottom, then start at **"Where to start"**.

---

## 1. The assignment (what is being built)

A ReachInbox hiring assignment: a production-grade **email scheduler service + dashboard**.

Backend: TypeScript, Express, **BullMQ + Redis** (no cron of any kind), MySQL, **Ethereal** fake SMTP, Elasticsearch search, live BullMQ dashboard, restart-safe and idempotent, configurable worker concurrency, minimum delay between sends, per-sender hourly limit shared across workers (overflow rolls into the next hour), and a **live Slack message when a sender's hourly limit is hit** (real OAuth, per-user, no-op if not connected).

Frontend: Next.js + Tailwind matching the Figma (the user supplied 7 screenshots, treat them as the design source of truth): real Google OAuth, dashboard with Scheduled/Sent, compose (subject, body, lead file upload with count, start time, delay, hourly limit), lists with loading/empty states.

Submission: private GitHub repo with `Mitrajit` and `Yadav036` added as collaborators, README (run steps, Ethereal setup, architecture, features mapped to requirements), demo video (max 5 min: schedule, dashboard, **restart scenario**, bonus rate-limit under load), assumptions/trade-offs, and the ClickUp form: https://forms.clickup.com/9005062261/f/8cbwp3n-8876/6NNNJ92DV93PQTAYST

---

## 2. Progress checklist

### Done and verified by automated checks

- [x] Scheduling API, MySQL storage, BullMQ delayed jobs, no cron (grep-verified)
- [x] Idempotency: atomic claim, deterministic job ids; rebuild from MySQL on boot
- [x] Configurable concurrency, minimum delay (`MIN_DELAY_MS`, default 2000), per-sender hourly limit (Redis Lua, default 200)
- [x] Elasticsearch search; mapping now **auto-upgrades existing indexes** (`ensureEmailIndex` uses put-mapping); live index reindexed
- [x] Bull Board at `/admin/queues` (admin emails only)
- [x] Slack OAuth + AES-256-GCM encrypted webhook + rate-limit alert notifier (unit tests only, see pending)
- [x] Light green UI matching the screenshots: login, sidebar with counts, list rows, full-page compose, Send Later popover, email detail
- [x] Rich-text bodies (Tiptap editor) sanitised server-side (write and read); sent as HTML + text
- [x] Attachments (upload/download/delete, allow-list, 5 MB each, 10 MB total, max 5), stored in MySQL, sent with the email; stale unclaimed uploads deleted after 24 h by the maintenance sweep
- [x] `GET /api/emails/:id` (owner-only), body previews on list rows
- [x] Google sign-in failures now redirect to `/login?error=signin_failed` (was a raw JSON 400)
- [x] Tests: **backend 65 passing (9 files), frontend 7 passing (3 files)**; typecheck, lint and production build clean
- [x] `npm run doctor` (scripts/check-env.mjs): reports missing credentials, never prints secrets. **Currently reports "Ready for the demo".**
- [x] README: run steps, config defaults (2 s min delay, 200/h/sender, concurrency 5), features by requirement, assumptions and trade-offs
- [x] Pushed to GitHub as `Purvee25`, three commits on top of the original five

### Configured (values live only in git-ignored env files)

- [x] Google OAuth client `outbox-web` in project `outbox-scheduler-510214`, consent screen External/Testing, the user's Gmail added as a **test user**
- [x] Two Ethereal sender accounts; SMTP login verified for both; `MAIL_TRANSPORT=ethereal`
- [x] Slack app `Outbox Scheduler` in workspace `PURVEE` (Incoming Webhooks on, scope `incoming-webhook`)
- [x] ngrok free static domain `uncross-untamed-coeditor.ngrok-free.dev`; `ADMIN_EMAILS` set

### Not yet confirmed (do these next, in order)

- [ ] **A real Google login through the tunnel** (never confirmed end to end)
- [ ] **A real send** through Ethereal: preview link opens, dashboard moves Scheduled → Sent
- [ ] **Slack "Connect Slack" + "Send test"** posting into the channel
- [ ] **A real hourly-limit alert** in Slack (compose with hourly limit 1 and ~4 recipients)
- [ ] Visual check of every screen against the 7 Figma screenshots (login, list, sent, detail, compose, Send Later, upload list)
- [ ] Restart scenario rehearsal (stop API + worker, start again, future emails still send)

### Remaining submission tasks (the user does these, or asks explicitly)

- [ ] Add reviewers `Mitrajit` and `Yadav036` (repo Settings → Collaborators)
- [ ] Record the demo video (script in README, section "Demo script")
- [ ] Add the user's own 2-line intro at the top of the README (plagiarism review is mentioned in the brief)
- [ ] Submit the ClickUp form
- [ ] Optional: deploy (Railway guide in `docs/railway.md`, or the Caddy compose file); the Caddyfile still has a `YOUR_DOMAIN` placeholder

---

## 3. How the local environment is wired right now

### Tunnel mode (important, non-obvious)

Slack requires an **HTTPS** redirect URL, and the session cookie belongs to a host, so the whole app is served through one HTTPS origin:

- Browser → `https://uncross-untamed-coeditor.ngrok-free.dev` → ngrok → Next.js on `:3000`
- Next.js proxies `/api`, `/auth`, `/admin`, `/health` to the API on `:4000` (opt-in `rewrites()` in `frontend/next.config.ts`, enabled by `API_PROXY_TARGET`)
- **Log in only through the tunnel address**, not `localhost:3000`.

Settings (URLs only, no secrets):

- `backend/.env`: `FRONTEND_ORIGIN` and `API_PUBLIC_URL` = the tunnel URL
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL=` (empty on purpose), `API_PROXY_TARGET=http://localhost:4000`, `DEV_TUNNEL_HOST=uncross-untamed-coeditor.ngrok-free.dev`
- Google redirect URIs on the client: `http://localhost:4000/auth/google/callback` and `https://uncross-untamed-coeditor.ngrok-free.dev/auth/google/callback`
- Slack redirect URL: `https://uncross-untamed-coeditor.ngrok-free.dev/api/slack/callback`

To go back to plain localhost: set `FRONTEND_ORIGIN=http://localhost:3000`, `API_PUBLIC_URL=http://localhost:4000`, `NEXT_PUBLIC_API_URL=http://localhost:4000`, remove the two proxy variables, restart API and frontend.

### Secrets

Only in `backend/.env` and `frontend/.env.local` (both git-ignored; `git check-ignore` confirmed). **Never paste them into chat.** `.env.example` documents every variable. Note: Slack's Client ID had a stray trailing space once; `npm run doctor` and a length check catch that kind of thing.

### Start everything

```bash
cd ~/Desktop/outbox
docker compose up -d                 # MySQL :3307, Redis :6379, Elasticsearch :9200
npm run dev:api                      # terminal 1  → :4000
npm run dev:worker                   # terminal 2
npm run dev -w frontend              # terminal 3  → :3000
ngrok http --url=https://uncross-untamed-coeditor.ngrok-free.dev 3000   # terminal 4
npm run doctor                       # should say "Ready for the demo"
```

Env changes need an API/worker restart (`tsx watch` does not reload `.env`). ngrok shows a "Visit Site" warning page on first visit.

Docker Compose is pinned to project name `outbox-email-scheduler` so the existing DB volumes still attach after the folder was moved and renamed.

### Useful commands

```bash
npm run test            # backend 65 + frontend 7
npm run typecheck       # all workspaces
npm run lint -w frontend
npm run reindex         # rebuild Elasticsearch from MySQL (idempotent)
npm run db:migrate -w backend
node scripts/load-test.mjs --help   # 1000-email load test
```

---

## 4. Architecture in brief

Monorepo (npm workspaces): `packages/shared` (zod schemas/types used by API and UI), `backend` (Express 5, Drizzle/MySQL, BullMQ workers), `frontend` (Next.js 16, React Query, Tailwind 4, Tiptap).

- **Source of truth is MySQL.** Redis holds jobs; on boot the worker re-enqueues every `scheduled` row missing a job (`reconcileScheduledEmails`).
- **One BullMQ delayed job per email**, `jobId = email-<uuid>` (duplicate adds are ignored).
- **Worker per job:** atomic claim (`UPDATE … WHERE status='scheduled'`) → Lua slot reservation (per-sender hourly cap + min gap) → send turn → Nodemailer → mark sent → index in Elasticsearch. Future slots use `moveToDelayed`, never `sleep`.
- **At-most-once on crash:** a `sending` row past its lease is marked `failed`, because SMTP has no idempotency key. Documented trade-off.
- **Fixed hourly window:** up to 2x the limit can fire around an hour boundary. Documented; left as is.
- **Maintenance sweep** is a self-rescheduling delayed job (lease expiry, reconcile, stale attachment cleanup). No cron.
- Full detail: README sections "Scheduling algorithm", "Worker flow", "Restart & recovery", "Behaviour under load".

---

## 5. Known quirks and open questions (read before changing things)

1. **Schema oddity.** `backend/src/db/schema.ts` and migrations `0003_swift_sleepwalker` / `0004_petite_songbird` add `starred`, `archived` (boolean), `archived_at` and `deleted_at` to `emails`. `0003` (with the boolean `archived`) was generated by a parallel session working in the same folder; Elasticsearch and list queries use it. **Do not clean it up without deciding on purpose** which of `archived` (boolean) and `archived_at` is canonical. Both columns exist in the dev database.
2. **Star / archive / delete are unfinished.** Endpoints exist (`PUT /api/emails/:id/star`, `PUT /api/emails/:id/archive`, `DELETE /api/emails/:id`) and the detail view has Star/Archive buttons, but **there are no tests for them** and delete semantics (hard vs soft, cancelling a scheduled job) were not reviewed. They are not required by the assignment. Either add tests or remove them before submission.
3. **Email/password login is not implemented.** The login form's fields are deliberately disabled (only Google OAuth exists). The assignment only requires Google.
4. **Two sessions edited this folder at once** at one point, and the folder was moved (`~/outbox-email-scheduler` → `~/Desktop/outbox`). If something looks changed unexpectedly, check `git diff` and `git log` first.
5. **Dev database contents.** About 5.5k email rows from earlier load tests, including about 2.5k scheduled with dates in 2027–2038 (nothing will send). A few old `sending` rows get marked `failed` by the lease sweep. Harmless, but do not be surprised in the UI.
6. **Slack** code paths are covered by unit tests only; nothing has been observed live yet.
7. **Attachments in MySQL** are re-read per send. Fine for a demo, heavy for 1000+ recipients with large files (documented).
8. Frontend has only 7 unit tests; backend coverage is much stronger.
9. Next.js here is a newer major version than usual; `frontend/AGENTS.md` says to check `node_modules/next/dist/docs/` before relying on memory of its APIs.

---

## 6. Working agreements with the user

- **Do not push to GitHub unless explicitly asked.** The user pushes or says so. (One explicit push was done for the current state.)
- Commits are authored as `Purvee Singh <162358925+Purvee25@users.noreply.github.com>` (already the global git identity). **No `Co-Authored-By: Claude` trailer** on this repo; the user wants Purvee25 as the only contributor.
- The GitHub account connected to the _previous_ Claude account was not the user's. Use plain `git`/`gh` with the machine's own login (`Purvee25`); do not use a GitHub connector unless it is confirmed to be the user's account.
- Do not create accounts, enter passwords/secrets, or click through OAuth consent for the user. Give steps; the user does them. Never ask the user to paste secrets into chat.
- Style: minimal diffs, conventional commits, answer first and keep it short, verify with real commands before claiming something works. Mark unverified things as unverified.

---

## 7. Where to start (in order)

1. `cd ~/Desktop/outbox && git status && git log --oneline | head` (expect clean, HEAD `d2e6ce7`).
2. Start the four processes (section 3), run `npm run doctor`, then `npm run test` (expect 65 + 7 passing).
3. With the user: incognito window → the tunnel URL → **Login with Google once** → dashboard. If sign-in fails, check the terminal running `dev:api`; failures are logged as `google sign-in failed` with the reason.
4. **Connect Slack** from the sidebar user card → **Send test** → confirm the message appears.
5. Compose a small campaign (2 recipients, 3 s delay) and watch it send; open the **Preview** link. Then hourly limit 1 with ~4 recipients to trigger the live Slack alert.
6. Decide on star/archive/delete (test it or remove it), then fix anything found while comparing screens with the Figma screenshots.
7. Rehearse the restart scenario, record the video, add the README intro, invite the reviewers, submit the form.

---

## 8. Prompt to paste into the new session

> I'm continuing a project in `~/Desktop/outbox` (repo `Purvee25/outbox-email-scheduler`). Read `HANDOFF.md` fully first. Then run `git status`, start the servers as described in section 3, and run `npm run doctor` and `npm run test`. Follow section 7. Rules: don't push unless I ask, no Claude co-author trailer, never ask me to paste secrets, and tell me clearly what is verified versus unverified. Begin by confirming the current state and then guide me through the Google login and Slack connect test through the ngrok tunnel.
