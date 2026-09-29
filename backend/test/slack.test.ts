import { eq } from "drizzle-orm";
import request from "supertest";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { slackConnections } from "../src/db/schema.js";
import {
  processNotificationJob,
  rateLimitMessage,
  RATE_LIMIT_HIT_JOB,
} from "../src/queue/notifications.js";
import {
  connectSessionRedis,
  createLoggedInUser,
  deleteUser,
  FRONTEND_ORIGIN,
  jsonResponse,
} from "./helpers.js";

const WEBHOOK_URL = "https://hooks.slack.com/services/T1/B1/secret";
const OAUTH_SUCCESS = {
  ok: true,
  access_token: "xoxb-test-token",
  team: { name: "Outbox" },
  incoming_webhook: { url: WEBHOOK_URL, channel: "#alerts" },
};

let app: ReturnType<typeof createApp>;
let user: Awaited<ReturnType<typeof createLoggedInUser>>;
const fetchMock = vi.fn<typeof fetch>();

beforeAll(async () => {
  await connectSessionRedis();
  app = createApp();
});

beforeEach(async () => {
  user = await createLoggedInUser();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await deleteUser(user.userId);
});


async function connectedViaOAuth() {
  const start = await request(app)
    .get("/api/slack/connect")
    .set("Cookie", user.cookie);
  const state = new URL(start.headers.location!).searchParams.get("state");
  fetchMock.mockResolvedValueOnce(jsonResponse(OAUTH_SUCCESS));
  return request(app)
    .get(`/api/slack/callback?code=abc&state=${state}`)
    .set("Cookie", user.cookie);
}

const connectionFor = (userId: string) =>
  db.query.slackConnections.findFirst({
    where: eq(slackConnections.userId, userId),
  });

describe("Slack OAuth", () => {
  it("redirects to Slack with the incoming-webhook scope and a state", async () => {
    const res = await request(app)
      .get("/api/slack/connect")
      .set("Cookie", user.cookie);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location!);
    expect(location.origin + location.pathname).toBe(
      "https://slack.com/oauth/v2/authorize",
    );
    expect(location.searchParams.get("scope")).toBe("incoming-webhook");
    expect(location.searchParams.get("state")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("requires login to connect", async () => {
    expect((await request(app).get("/api/slack/connect")).status).toBe(401);
  });

  it("stores the webhook encrypted and reports the user as connected", async () => {
    const res = await connectedViaOAuth();

    expect(res.headers.location).toBe(
      `${FRONTEND_ORIGIN}/dashboard?slack=connected`,
    );
    const connection = await connectionFor(user.userId);
    expect(connection?.channel).toBe("#alerts");
    expect(connection?.webhookUrlEnc).not.toContain("hooks.slack.com");
    const me = await request(app).get("/api/me").set("Cookie", user.cookie);
    expect(me.body.slackConnected).toBe(true);
  });

  it("rejects a callback whose state does not match (CSRF)", async () => {
    await request(app).get("/api/slack/connect").set("Cookie", user.cookie);
    const res = await request(app)
      .get("/api/slack/callback?code=abc&state=forged")
      .set("Cookie", user.cookie);

    expect(res.headers.location).toBe(
      `${FRONTEND_ORIGIN}/dashboard?slack=error`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await connectionFor(user.userId)).toBeUndefined();
  });

  it("disconnects by revoking the token in Slack and deleting the connection", async () => {
    await connectedViaOAuth();
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, revoked: true }));

    const res = await request(app)
      .delete("/api/slack")
      .set("Cookie", user.cookie)
      .set("Origin", FRONTEND_ORIGIN);

    expect(res.status).toBe(204);
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toBe(
      "https://slack.com/api/auth.revoke",
    );
    expect(await connectionFor(user.userId)).toBeUndefined();
  });
});

describe("rate-limit notifications", () => {
  const job = (userId: string) =>
    ({
      name: RATE_LIMIT_HIT_JOB,
      data: {
        userId,
        sender: "s1@ethereal.email",
        window: 1,
        limit: 200,
        resumesAt: "2026-09-29T18:00:00.000Z",
      },
    }) as Parameters<typeof processNotificationJob>[0];

  it("does nothing, without failing, when Slack is not connected", async () => {
    await expect(
      processNotificationJob(job(user.userId)),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the alert to the connected webhook", async () => {
    await connectedViaOAuth();
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await processNotificationJob(job(user.userId));

    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe(WEBHOOK_URL);
    expect(JSON.parse(String(init?.body)).text).toBe(
      rateLimitMessage(job(user.userId).data),
    );
    expect(rateLimitMessage(job(user.userId).data)).toContain(
      "resume at 18:00 UTC",
    );
  });

  it("drops a webhook Slack reports as removed, so later alerts are skipped until reconnect", async () => {
    await connectedViaOAuth();
    fetchMock.mockResolvedValueOnce(
      new Response("no_service", { status: 404 }),
    );

    await processNotificationJob(job(user.userId));

    expect(await connectionFor(user.userId)).toBeUndefined();
  });

  it("throws on transient Slack errors so the job is retried", async () => {
    await connectedViaOAuth();
    fetchMock.mockResolvedValueOnce(
      new Response("internal_error", { status: 500 }),
    );

    await expect(processNotificationJob(job(user.userId))).rejects.toThrow(
      "Slack webhook returned 500",
    );
    expect(await connectionFor(user.userId)).toBeDefined();
  });
});
