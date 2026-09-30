import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { claimEmail } from "../src/db/email-repo.js";
import { campaigns, emails } from "../src/db/schema.js";
import { emailJobId, emailQueue, enqueueEmails } from "../src/queue/queues.js";
import {
  connectSessionRedis,
  createLoggedInUser,
  deleteUser,
  FRONTEND_ORIGIN,
} from "./helpers.js";

type EmailStatus = "scheduled" | "sending" | "sent";
const FUTURE_MS = 60 * 60 * 1000;

let app: ReturnType<typeof createApp>;
const createdUsers: string[] = [];

async function login() {
  const user = await createLoggedInUser();
  createdUsers.push(user.userId);
  return user;
}

async function seedEmail(userId: string, status: EmailStatus = "scheduled") {
  const campaignId = randomUUID();
  await db.insert(campaigns).values({
    id: campaignId,
    userId,
    subject: "Quarterly update",
    body: "<p>Hello</p>",
    startAt: new Date(),
    delayMs: 0,
    hourlyLimit: 10,
  });
  const id = randomUUID();
  await db.insert(emails).values({
    id,
    campaignId,
    userId,
    recipient: `${id}@acme.test`,
    sender: "s1@ethereal.email",
    scheduledAt: new Date(Date.now() + FUTURE_MS),
    status,
  });
  return id;
}

const mutate = (method: "put" | "delete", path: string, cookie: string) =>
  request(app)
    [method](path)
    .set("Cookie", cookie)
    .set("Origin", FRONTEND_ORIGIN);

const listIds = async (cookie: string, tab: string) => {
  const res = await request(app)
    .get(`/api/emails?tab=${tab}`)
    .set("Cookie", cookie);
  return res.body.items.map((item: { id: string }) => item.id);
};

beforeAll(async () => {
  await connectSessionRedis();
  app = createApp();
});

afterEach(async () => {
  await Promise.all(createdUsers.splice(0).map(deleteUser));
});

describe("PUT /api/emails/:id/star", () => {
  it("stars and unstars an email", async () => {
    const user = await login();
    const id = await seedEmail(user.userId);

    const starred = await mutate(
      "put",
      `/api/emails/${id}/star`,
      user.cookie,
    ).send({ starred: true });
    const detail = await request(app)
      .get(`/api/emails/${id}`)
      .set("Cookie", user.cookie);
    await mutate("put", `/api/emails/${id}/star`, user.cookie).send({
      starred: false,
    });
    const after = await request(app)
      .get(`/api/emails/${id}`)
      .set("Cookie", user.cookie);

    expect(starred.status).toBe(204);
    expect(detail.body.starred).toBe(true);
    expect(after.body.starred).toBe(false);
  });

  it("rejects a non-boolean value", async () => {
    const user = await login();
    const id = await seedEmail(user.userId);

    const res = await mutate("put", `/api/emails/${id}/star`, user.cookie).send(
      { starred: "yes" },
    );

    expect(res.status).toBe(400);
  });
});

describe("PUT /api/emails/:id/archive", () => {
  it("moves an email to the Archived tab and back", async () => {
    const user = await login();
    const id = await seedEmail(user.userId);

    await mutate("put", `/api/emails/${id}/archive`, user.cookie).send({
      archived: true,
    });
    const whileArchived = {
      scheduled: await listIds(user.cookie, "scheduled"),
      archived: await listIds(user.cookie, "archived"),
    };
    await mutate("put", `/api/emails/${id}/archive`, user.cookie).send({
      archived: false,
    });

    expect(whileArchived.scheduled).not.toContain(id);
    expect(whileArchived.archived).toContain(id);
    expect(await listIds(user.cookie, "scheduled")).toContain(id);
  });
});

describe("DELETE /api/emails/:id", () => {
  it("deletes a scheduled email, removes its job and stops it from ever sending", async () => {
    const user = await login();
    const id = await seedEmail(user.userId);
    await enqueueEmails([
      { id, scheduledAt: new Date(Date.now() + FUTURE_MS) },
    ]);

    const res = await mutate("delete", `/api/emails/${id}`, user.cookie);

    expect(res.status).toBe(204);
    expect(
      await db.select().from(emails).where(eq(emails.id, id)),
    ).toHaveLength(0);
    expect(await emailQueue.getJob(emailJobId(id))).toBeUndefined();
    expect(await claimEmail(id, randomUUID(), 1000)).toBe(false);
  });

  it("refuses to delete an email that is being sent", async () => {
    const user = await login();
    const id = await seedEmail(user.userId, "sending");

    const res = await mutate("delete", `/api/emails/${id}`, user.cookie);

    expect(res.status).toBe(409);
    expect(
      await db.select().from(emails).where(eq(emails.id, id)),
    ).toHaveLength(1);
  });

  it("deletes a sent email", async () => {
    const user = await login();
    const id = await seedEmail(user.userId, "sent");

    const res = await mutate("delete", `/api/emails/${id}`, user.cookie);

    expect(res.status).toBe(204);
  });
});

describe("ownership", () => {
  it("returns 404 for another user's email on every action and changes nothing", async () => {
    const owner = await login();
    const stranger = await login();
    const id = await seedEmail(owner.userId);

    const responses = [
      await mutate("put", `/api/emails/${id}/star`, stranger.cookie).send({
        starred: true,
      }),
      await mutate("put", `/api/emails/${id}/archive`, stranger.cookie).send({
        archived: true,
      }),
      await mutate("delete", `/api/emails/${id}`, stranger.cookie),
    ];
    const [row] = await db.select().from(emails).where(eq(emails.id, id));

    expect(responses.map((res) => res.status)).toEqual([404, 404, 404]);
    expect(row).toMatchObject({ starred: false, archivedAt: null });
  });
});
