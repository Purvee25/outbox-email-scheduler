import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "../src/db/client.js";
import {
  claimEmail,
  expireLeases,
  LEASE_EXPIRED_ERROR,
  markSent,
  recordAttempt,
  releaseClaim,
} from "../src/db/email-repo.js";
import { campaigns, emails, users } from "../src/db/schema.js";

const LEASE_MS = 60_000;
const userId = randomUUID();
const campaignId = randomUUID();
let emailId: string;

async function statusOf(id: string) {
  return db.query.emails.findFirst({ where: eq(emails.id, id) });
}

beforeEach(async () => {
  if (!(await db.query.users.findFirst({ where: eq(users.id, userId) }))) {
    await db
      .insert(users)
      .values({
        id: userId,
        googleId: `test-${userId}`,
        email: "t@x.test",
        name: "Test",
      });
    await db.insert(campaigns).values({
      id: campaignId,
      userId,
      subject: "s",
      body: "b",
      startAt: new Date(),
      delayMs: 0,
      hourlyLimit: 10,
    });
  }
  emailId = randomUUID();
  await db.insert(emails).values({
    id: emailId,
    campaignId,
    userId,
    recipient: `${emailId}@x.test`,
    sender: "s@x.test",
    scheduledAt: new Date(),
  });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId)); // cascades to campaigns and emails
  await pool.end();
});

describe("claimEmail", () => {
  it("lets exactly one of many concurrent workers claim an email", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        claimEmail(emailId, randomUUID(), LEASE_MS),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await statusOf(emailId))?.status).toBe("sending");
  });

  it("refuses to claim an email that was already sent", async () => {
    const lease = randomUUID();
    await claimEmail(emailId, lease, LEASE_MS);
    await markSent(emailId, lease, { messageId: "<m@x>", previewUrl: null });

    expect(await claimEmail(emailId, randomUUID(), LEASE_MS)).toBe(false);
  });

  it("can be claimed again after the claim is released", async () => {
    const lease = randomUUID();
    await claimEmail(emailId, lease, LEASE_MS);
    await releaseClaim(emailId, lease);

    expect(await claimEmail(emailId, randomUUID(), LEASE_MS)).toBe(true);
  });
});

describe("lease handling", () => {
  it("ignores releases and results from a worker that does not hold the lease", async () => {
    await claimEmail(emailId, "real-lease", LEASE_MS);
    await releaseClaim(emailId, "stale-lease");
    await markSent(emailId, "stale-lease", {
      messageId: "<m@x>",
      previewUrl: null,
    });

    expect((await statusOf(emailId))?.status).toBe("sending");
  });

  it("marks expired leases failed instead of re-sending, but lets a late success win", async () => {
    const lease = randomUUID();
    await claimEmail(emailId, lease, -1_000); // already expired

    expect(await expireLeases()).toBeGreaterThanOrEqual(1);
    const expired = await statusOf(emailId);
    expect(expired?.status).toBe("failed");
    expect(expired?.error).toBe(LEASE_EXPIRED_ERROR);

    await markSent(emailId, lease, { messageId: "<m@x>", previewUrl: null });
    expect((await statusOf(emailId))?.status).toBe("sent");
  });

  it("counts attempts only for the lease holder", async () => {
    const lease = randomUUID();
    await claimEmail(emailId, lease, LEASE_MS);

    expect(await recordAttempt(emailId, lease)).toBe(1);
    expect(await recordAttempt(emailId, "other")).toBe(1);
  });
});
