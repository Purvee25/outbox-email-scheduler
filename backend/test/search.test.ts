import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { campaigns, emails } from "../src/db/schema.js";
import { EMAIL_INDEX, es } from "../src/search/client.js";
import { indexEmails } from "../src/search/indexer.js";
import {
  connectSessionRedis,
  createLoggedInUser,
  deleteUser,
} from "./helpers.js";

let app: ReturnType<typeof createApp>;
let owner: Awaited<ReturnType<typeof createLoggedInUser>>;
let stranger: Awaited<ReturnType<typeof createLoggedInUser>>;
const ids = { adaScheduled: "", bobScheduled: "", cySent: "", strangerAda: "" };

async function seedEmail(
  userId: string,
  recipient: string,
  subject: string,
  status: "scheduled" | "sent",
) {
  const campaignId = randomUUID();
  await db.insert(campaigns).values({
    id: campaignId,
    userId,
    subject,
    body: `Body for ${recipient}`,
    startAt: new Date(),
    delayMs: 0,
    hourlyLimit: 10,
  });
  const id = randomUUID();
  await db.insert(emails).values({
    id,
    campaignId,
    userId,
    recipient,
    sender: "s1@ethereal.email",
    scheduledAt: new Date(),
    status,
    ...(status === "sent" && { sentAt: new Date() }),
  });
  return id;
}

const search = (cookie: string, query: string) =>
  request(app).get(`/api/emails?${query}`).set("Cookie", cookie);
const recipients = (res: request.Response) =>
  res.body.items.map((item: { recipient: string }) => item.recipient).sort();

beforeAll(async () => {
  await connectSessionRedis();
  await es.indices.delete({ index: EMAIL_INDEX, ignore_unavailable: true });
  app = createApp();
  owner = await createLoggedInUser();
  stranger = await createLoggedInUser();
  ids.adaScheduled = await seedEmail(
    owner.userId,
    "ada@acme.test",
    "Pricing for Acme",
    "scheduled",
  );
  ids.bobScheduled = await seedEmail(
    owner.userId,
    "bob@beta.test",
    "Partnership idea",
    "scheduled",
  );
  ids.cySent = await seedEmail(
    owner.userId,
    "cy@acme.test",
    "Pricing follow-up",
    "sent",
  );
  ids.strangerAda = await seedEmail(
    stranger.userId,
    "ada@acme.test",
    "Pricing for Acme",
    "scheduled",
  );
  await indexEmails(Object.values(ids), { refresh: true });
});

afterAll(async () => {
  await Promise.all([deleteUser(owner.userId), deleteUser(stranger.userId)]);
  await es.indices.delete({ index: EMAIL_INDEX, ignore_unavailable: true });
});

describe("GET /api/emails?q= (Elasticsearch)", () => {
  it("matches recipients by prefix while typing", async () => {
    const res = await search(owner.cookie, "tab=scheduled&q=ad");

    expect(res.status).toBe(200);
    expect(recipients(res)).toEqual(["ada@acme.test"]);
  });

  it("matches subject words and keeps results inside the tab", async () => {
    const scheduled = await search(owner.cookie, "tab=scheduled&q=pricing");
    const sent = await search(owner.cookie, "tab=sent&q=pricing");

    expect(recipients(scheduled)).toEqual(["ada@acme.test"]);
    expect(recipients(sent)).toEqual(["cy@acme.test"]);
  });

  it("never returns another user's emails", async () => {
    const res = await search(stranger.cookie, "tab=scheduled&q=acme");

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(ids.strangerAda);
  });

  it("applies the status filter", async () => {
    const res = await search(owner.cookie, "tab=sent&status=failed&q=pricing");

    expect(res.body.total).toBe(0);
  });

  it("rejects a status that does not belong to the tab", async () => {
    const res = await search(owner.cookie, "tab=scheduled&status=sent");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("status does not belong to this tab");
  });
});

describe("indexEmails", () => {
  it("reflects the current MySQL state and removes deleted rows", async () => {
    await db
      .update(emails)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(emails.id, ids.bobScheduled));
    await db.delete(emails).where(eq(emails.id, ids.adaScheduled));

    const result = await indexEmails([ids.bobScheduled, ids.adaScheduled], {
      refresh: true,
    });

    expect(result).toEqual({ indexed: 1, deleted: 1 });
    expect(
      (await es.get({ index: EMAIL_INDEX, id: ids.bobScheduled }))._source,
    ).toMatchObject({ status: "sent" });
    expect(await es.exists({ index: EMAIL_INDEX, id: ids.adaScheduled })).toBe(
      false,
    );
  });
});
