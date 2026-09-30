import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { sessionRedis } from "../src/lib/redis.js";
import {
  connectSessionRedis,
  createLoggedInUser,
  deleteUser,
  FRONTEND_ORIGIN,
} from "./helpers.js";

let app: ReturnType<typeof createApp>;
const createdUsers: string[] = [];

async function login(email?: string) {
  const user = await createLoggedInUser(email);
  createdUsers.push(user.userId);
  return user;
}

beforeAll(async () => {
  await connectSessionRedis();
  app = createApp();
});

// The auth limiter counts in shared Redis; stale counts from earlier runs or a dev server would 429 these tests.
beforeEach(async () => {
  const keys = await sessionRedis.keys("rl-api:auth:*");
  if (keys.length > 0) await sessionRedis.del(keys);
});

afterEach(async () => {
  await Promise.all(createdUsers.splice(0).map(deleteUser));
});

describe("Bull Board", () => {
  it("requires login", async () => {
    expect((await request(app).get("/admin/queues")).status).toBe(401);
  });

  it("is forbidden to users outside ADMIN_EMAILS", async () => {
    const user = await login();
    expect(
      (await request(app).get("/admin/queues").set("Cookie", user.cookie))
        .status,
    ).toBe(403);
  });

  it("is served to admins", async () => {
    const admin = await login("admin@scheduler.test");
    const res = await request(app)
      .get("/admin/queues")
      .set("Cookie", admin.cookie);

    expect(res.status).toBe(200);
    expect(res.text).toContain("<html");
  });
});

describe("per-user isolation", () => {
  it("only lists the logged-in user's emails", async () => {
    const owner = await login();
    const other = await login();
    await request(app)
      .post("/api/campaigns")
      .set("Cookie", owner.cookie)
      .set("Origin", FRONTEND_ORIGIN)
      .send({
        subject: "Hi",
        body: "Body",
        recipients: ["lead@example.test"],
        startAt: new Date(Date.now() + 3_600_000).toISOString(),
        delayMs: 0,
        hourlyLimit: 10,
      })
      .expect(201);

    const ownerList = await request(app)
      .get("/api/emails?tab=scheduled")
      .set("Cookie", owner.cookie);
    const otherList = await request(app)
      .get("/api/emails?tab=scheduled")
      .set("Cookie", other.cookie);

    expect(ownerList.body.total).toBe(1);
    expect(otherList.body.total).toBe(0);
  });

  it("serves an email's body to its owner only", async () => {
    const owner = await login();
    const other = await login();
    await request(app)
      .post("/api/campaigns")
      .set("Cookie", owner.cookie)
      .set("Origin", FRONTEND_ORIGIN)
      .send({
        subject: "Hi",
        body: "Secret body",
        recipients: ["lead@example.test"],
        startAt: new Date(Date.now() + 3_600_000).toISOString(),
        delayMs: 0,
        hourlyLimit: 10,
      })
      .expect(201);
    const list = await request(app)
      .get("/api/emails?tab=scheduled")
      .set("Cookie", owner.cookie);
    const emailId = list.body.items[0].id;

    const asOwner = await request(app)
      .get(`/api/emails/${emailId}`)
      .set("Cookie", owner.cookie);
    const asOther = await request(app)
      .get(`/api/emails/${emailId}`)
      .set("Cookie", other.cookie);
    const malformed = await request(app)
      .get("/api/emails/not-a-uuid")
      .set("Cookie", owner.cookie);

    expect(asOwner.status).toBe(200);
    expect(asOwner.body.body).toBe("<p>Secret body</p>");
    expect(asOther.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});

describe("request validation", () => {
  it("rejects an invalid campaign with a 400 explaining why", async () => {
    const user = await login();
    const res = await request(app)
      .post("/api/campaigns")
      .set("Cookie", user.cookie)
      .set("Origin", FRONTEND_ORIGIN)
      .send({ subject: "", recipients: ["not-an-email"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("recipients.0");
  });
});

describe("google sign-in callback", () => {
  it("sends a failed sign-in back to the login page instead of showing raw JSON", async () => {
    const res = await request(app).get("/auth/google/callback?code=x&state=y");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      `${FRONTEND_ORIGIN}/login?error=signin_failed`,
    );
  });
});

describe("rate limiting", () => {
  it("limits login attempts per client", async () => {
    const keys = await sessionRedis.keys("rl-api:auth:*");
    if (keys.length > 0) await sessionRedis.del(keys);

    const statuses = [];
    for (let i = 0; i < 21; i++)
      statuses.push((await request(app).get("/auth/google")).status);

    expect(statuses.slice(0, 20).every((status) => status !== 429)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
