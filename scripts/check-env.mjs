#!/usr/bin/env node
/**
 * Demo-readiness check for backend/.env. Reports which credentials are missing and where to
 * get them. Never prints secret values. Exits 1 when a demo-critical item is missing.
 *
 *   npm run doctor
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(import.meta.dirname, "../backend/.env");
const HEALTH_TIMEOUT_MS = 3_000;

function parseEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

if (!existsSync(ENV_PATH)) {
  console.error("backend/.env not found. Run: cp .env.example backend/.env");
  process.exit(1);
}

const env = parseEnvFile(ENV_PATH);
const has = (key) => Boolean(env[key]);
const apiUrl = env.API_PUBLIC_URL || "http://localhost:4000";
const senders = (env.ETHEREAL_SENDERS || "").split(",").map((s) => s.trim()).filter(Boolean);
const validSender = (entry) => /^[^:\s]+@[^:\s]+:.+$/.test(entry);

const checks = [
  {
    name: "Google login",
    critical: true,
    ok: has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET"),
    fix: [
      "1. https://console.cloud.google.com → APIs & Services → OAuth consent screen (External, add yourself as a test user).",
      "2. Credentials → Create credentials → OAuth client ID → Web application.",
      `3. Authorized redirect URI: ${apiUrl}/auth/google/callback`,
      "4. Put the client ID and secret in GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.",
    ],
  },
  {
    name: "Ethereal senders (2+ recommended)",
    critical: true,
    ok: senders.length > 0 && senders.every(validSender),
    fix: [
      "1. Open https://ethereal.email/create two or three times; each gives a user@ethereal.email and password.",
      "2. ETHEREAL_SENDERS=user1@ethereal.email:pass1,user2@ethereal.email:pass2",
      senders.length > 0 && !senders.every(validSender)
        ? "   (an entry is not in user@host:password form)"
        : null,
    ].filter(Boolean),
  },
  {
    name: "Real SMTP enabled (MAIL_TRANSPORT=ethereal)",
    critical: true,
    ok: (env.MAIL_TRANSPORT || "ethereal") === "ethereal",
    fix: [
      `MAIL_TRANSPORT is "${env.MAIL_TRANSPORT}": messages are only logged, so no Ethereal preview links exist.`,
      "Set MAIL_TRANSPORT=ethereal for the demo (keep 'log' for load tests).",
    ],
  },
  {
    name: "Slack alerts",
    critical: true,
    ok: has("SLACK_CLIENT_ID") && has("SLACK_CLIENT_SECRET"),
    fix: [
      "1. https://api.slack.com/apps → Create New App → From scratch.",
      "2. Incoming Webhooks: On. OAuth & Permissions → add scope incoming-webhook.",
      "3. Redirect URL must be HTTPS (Slack rejects http): deploy, or tunnel with ngrok/cloudflared,",
      "   set API_PUBLIC_URL to the HTTPS URL, and use  <API_PUBLIC_URL>/api/slack/callback",
      "4. Put the client ID and secret in SLACK_CLIENT_ID / SLACK_CLIENT_SECRET.",
    ],
  },
  {
    name: "Bull Board access (ADMIN_EMAILS)",
    critical: false,
    ok: has("ADMIN_EMAILS"),
    fix: ["Set ADMIN_EMAILS to the Google address you log in with, to open /admin/queues."],
  },
  {
    name: "Session secret ≥ 32 chars",
    critical: true,
    ok: (env.SESSION_SECRET || "").length >= 32,
    fix: ["SESSION_SECRET=$(openssl rand -hex 32)"],
  },
  {
    name: "Encryption key (64 hex chars)",
    critical: true,
    ok: /^[0-9a-f]{64}$/i.test(env.ENCRYPTION_KEY || ""),
    fix: ["ENCRYPTION_KEY=$(openssl rand -hex 32)"],
  },
];

try {
  const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
  const health = await response.json();
  checks.push({
    name: `API health (${apiUrl}/health)`,
    critical: true,
    ok: health.status === "ok",
    fix: [
      `Reported: ${JSON.stringify(health)}`,
      "Restart the API and worker from this folder (an old process may hold a dead DB connection):",
      "  npm run dev:api   and   npm run dev:worker",
    ],
  });
} catch {
  checks.push({
    name: `API health (${apiUrl}/health)`,
    critical: true,
    ok: false,
    fix: ["API is not reachable. Start it with: npm run dev:api"],
  });
}

let blockers = 0;
for (const check of checks) {
  const mark = check.ok ? "✅" : check.critical ? "❌" : "⚠️ ";
  console.log(`${mark} ${check.name}`);
  if (!check.ok) {
    if (check.critical) blockers += 1;
    for (const line of check.fix) console.log(`     ${line}`);
  }
}
console.log(blockers === 0 ? "\nReady for the demo." : `\n${blockers} demo-critical item(s) to fix.`);
process.exit(blockers === 0 ? 0 : 1);
