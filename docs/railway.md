# Deploying to Railway

Railway can run the three application services (API, worker, frontend) while you
bring MySQL, Redis and Elasticsearch as Railway plugins or managed add-ons.

---

## 1 · Prerequisites

| Tool | Version |
|------|---------|
| Railway CLI | `npm i -g @railway/cli` |
| Node.js | ≥ 20 |

Log in:
```bash
railway login
```

---

## 2 · Managed services (add-ons)

In the Railway dashboard, create a **new project** then add:

| Add-on | Notes |
|--------|-------|
| **MySQL** | Railway MySQL plugin → copy `DATABASE_URL` |
| **Redis** | Railway Redis plugin → copy `REDIS_URL` |
| **Elasticsearch** | Railway doesn't have a managed ES; use [Bonsai](https://bonsai.io) free tier or the [Railway community template](https://railway.com/template/elasticsearch). Copy the URL as `ELASTICSEARCH_URL`. |

---

## 3 · Services

Create three Railway services from the same GitHub repo, each with a different
start command. Railway picks up `Dockerfile` automatically when present.

### 3a · API

```
Service name : api
Root directory: /          (monorepo root)
Dockerfile   : backend/Dockerfile
Docker target: api
Start command: (from Dockerfile CMD)
```

**Environment variables** (set in Railway dashboard → Variables):

```
NODE_ENV=production
PORT=4000
FRONTEND_ORIGIN=https://<your-frontend.up.railway.app>
API_PUBLIC_URL=https://<your-api.up.railway.app>
DATABASE_URL=<from Railway MySQL plugin>
REDIS_URL=<from Railway Redis plugin>
ELASTICSEARCH_URL=<from Bonsai>
SESSION_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
SLACK_CLIENT_ID=<from api.slack.com>
SLACK_CLIENT_SECRET=<from api.slack.com>
MAIL_TRANSPORT=ethereal
ETHEREAL_SENDERS=user1:pass1,user2:pass2,user3:pass3
ADMIN_EMAILS=your@email.com
WORKER_CONCURRENCY=5
MIN_DELAY_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
MAX_SEND_ATTEMPTS=3
```

### 3b · Worker

```
Service name : worker
Root directory: /
Dockerfile   : backend/Dockerfile
Docker target: worker
```

**Shares the same env vars as the API** (use Railway's variable references or
copy them). Scale to 2 replicas for the demo:

Dashboard → worker service → Settings → Replicas → 2

Or via CLI:
```bash
railway scale --replicas 2 --service worker
```

### 3c · Frontend

```
Service name : frontend
Root directory: /
Dockerfile   : frontend/Dockerfile
Build arg    : NEXT_PUBLIC_API_URL=https://<your-api.up.railway.app>
```

Only one env var needed at build time:

```
NEXT_PUBLIC_API_URL=https://<your-api.up.railway.app>
```

---

## 4 · Database migration

Railway doesn't run one-shot containers natively, so run the migration manually
after the first deploy:

```bash
railway run --service api \
  node --import tsx/esm backend/src/db/migrate.ts
```

---

## 5 · Update OAuth redirect URLs

Once all three services have Railway-assigned URLs:

**Google Cloud Console** → your OAuth client → Authorised redirect URIs:
```
https://<your-api.up.railway.app>/auth/google/callback
```

**Slack app** → OAuth & Permissions → Redirect URLs:
```
https://<your-api.up.railway.app>/api/slack/callback
```

**DuckDNS** (optional, prettier URL):
1. Register a subdomain at [duckdns.org](https://www.duckdns.org).
2. Update the A record to the Railway IP (or use a CNAME to the `.up.railway.app` domain).
3. Update `FRONTEND_ORIGIN`, `API_PUBLIC_URL`, and both OAuth redirect URLs.

---

## 6 · Verify deployment

```bash
# Health check
curl https://<your-api.up.railway.app>/health

# Expected: {"status":"ok","mysql":"ok","redis":"ok"}
```

Open `https://<your-api.up.railway.app>/admin/queues` — you should see the
Bull Board (requires your email to be in `ADMIN_EMAILS`).

---

## 7 · Load test

```bash
# Copy your session cookie from browser DevTools first
node scripts/load-test.mjs \
  --api   https://<your-api.up.railway.app> \
  --cookie "sid=<value>" \
  --count 1000 \
  --hourly-limit 10
```

Watch:
- Dashboard → Scheduled tab fills with 1 000 rows.
- Bull Board → delayed jobs.
- After ~10 sends, Slack fires the hourly-limit alert.
- Jobs beyond the limit show `scheduled_at` in the next hour window.
- With 2 worker replicas, no duplicates: `SELECT COUNT(*) FROM emails WHERE status='sent'` grows, `MAX(attempts)` stays 1.
