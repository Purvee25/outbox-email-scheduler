#!/usr/bin/env node
/**
 * load-test.mjs — schedules 1 000 emails via the live API to demonstrate:
 *   1. Emails rolling into the next hour window (hourly limit exceeded).
 *   2. The Slack alert firing when the limit is hit.
 *   3. Two worker replicas sharing the load while the per-sender limit holds.
 *
 * Usage:
 *   node scripts/load-test.mjs \
 *     --api   https://your-app.railway.app \
 *     --email your@email.com         # must already be logged in; cookie below
 *     --cookie "sid=<value>"         # copy from browser DevTools → Application → Cookies
 *
 * Options (all optional — defaults shown):
 *   --count        1000    number of emails to schedule
 *   --delay        2000    delay between emails in ms (MIN_DELAY_MS on server wins)
 *   --hourly-limit 10      low cap so emails spill into the next hour
 *   --start-mins   2       minutes from now for the first send
 *
 * What to watch:
 *   - Dashboard "Scheduled" tab — emails appear immediately.
 *   - Bull Board /admin/queues   — jobs in "delayed" state.
 *   - After ~10 sends, Slack fires "Hourly limit hit for sender …".
 *   - Jobs for the overflow batch show scheduled_at in the next hour.
 *   - With --scale worker=2, both workers share jobs; 0 duplicates in DB.
 */

import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    api:          { type: "string",  default: "http://localhost:4000" },
    cookie:       { type: "string",  default: "" },
    count:        { type: "string",  default: "1000" },
    delay:        { type: "string",  default: "2000" },
    "hourly-limit": { type: "string", default: "10" },
    "start-mins": { type: "string",  default: "2" },
  },
  strict: false,
});

const API          = args.api.replace(/\/$/, "");
const COOKIE       = args.cookie;
const COUNT        = parseInt(args.count, 10);
const DELAY_MS     = parseInt(args.delay, 10);
const HOURLY_LIMIT = parseInt(args["hourly-limit"], 10);
const START_MINS   = parseInt(args["start-mins"], 10);

// ── Build recipient list ──────────────────────────────────────────────────────
// Uses numbered aliases so every address is unique but no real mailbox needed.
const recipients = Array.from(
  { length: COUNT },
  (_, i) => `load-test-${String(i + 1).padStart(4, "0")}@example.com`,
);

const startAt = new Date(Date.now() + START_MINS * 60 * 1000).toISOString();

const body = {
  subject: `Load test — ${COUNT} emails @ limit ${HOURLY_LIMIT}/h`,
  body: [
    "This is an automated load-test email.",
    "",
    `Campaign: ${COUNT} recipients`,
    `Delay between emails: ${DELAY_MS} ms`,
    `Hourly limit: ${HOURLY_LIMIT} per sender`,
    `Start: ${startAt}`,
    "",
    "If you see this in Ethereal, the worker sent it correctly.",
  ].join("\n"),
  recipients,
  startAt,
  delayMs: DELAY_MS,
  hourlyLimit: HOURLY_LIMIT,
};

// ── POST /api/campaigns ───────────────────────────────────────────────────────
console.log(`\n🚀 Scheduling ${COUNT} emails against ${API}`);
console.log(`   hourly limit : ${HOURLY_LIMIT}/sender`);
console.log(`   delay        : ${DELAY_MS} ms`);
console.log(`   start        : ${startAt}\n`);

const headers = {
  "Content-Type": "application/json",
  ...(COOKIE ? { Cookie: COOKIE } : {}),
};

const res = await fetch(`${API}/api/campaigns`, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`❌  POST /api/campaigns → HTTP ${res.status}\n${text}`);
  process.exit(1);
}

const data = await res.json();

console.log("✅  Campaign created:\n");
console.log(`   campaignId          : ${data.campaignId}`);
console.log(`   scheduledCount      : ${data.scheduledCount}`);
console.log(`   duplicatesRemoved   : ${data.duplicatesRemoved}`);
console.log(`   effectiveHourlyLimit: ${data.effectiveHourlyLimit}`);
console.log(`   firstSendAt         : ${data.firstSendAt}`);
console.log(`   lastSendAt          : ${data.lastSendAt}`);

const first = new Date(data.firstSendAt);
const last  = new Date(data.lastSendAt);
const spanH = ((last - first) / 3_600_000).toFixed(1);
console.log(`\n   ⏱  Span: ~${spanH} hours`);
console.log(`\nWatch the dashboard → Scheduled tab, and check Bull Board at ${API}/admin/queues`);
console.log("Slack alert should fire when the first hourly window fills up.\n");
