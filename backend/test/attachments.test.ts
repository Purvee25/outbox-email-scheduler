import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  deleteStaleUnclaimedAttachments,
  findOwnedAttachment,
  loadCampaignFiles,
} from "../src/db/attachment-repo.js";
import {
  connectSessionRedis,
  createLoggedInUser,
  deleteUser,
  FRONTEND_ORIGIN,
} from "./helpers.js";

let app: ReturnType<typeof createApp>;
const createdUsers: string[] = [];

async function login() {
  const user = await createLoggedInUser();
  createdUsers.push(user.userId);
  return user;
}

const upload = (
  cookie: string,
  content: Buffer,
  filename = "notes.txt",
  contentType = "text/plain",
) =>
  request(app)
    .post("/api/attachments")
    .set("Cookie", cookie)
    .set("Origin", FRONTEND_ORIGIN)
    .attach("file", content, { filename, contentType });

const campaign = (cookie: string, attachmentIds: string[]) =>
  request(app)
    .post("/api/campaigns")
    .set("Cookie", cookie)
    .set("Origin", FRONTEND_ORIGIN)
    .send({
      subject: "Hi",
      body: "<p>Body</p>",
      recipients: ["lead@example.test"],
      startAt: new Date(Date.now() + 3_600_000).toISOString(),
      delayMs: 0,
      hourlyLimit: 10,
      attachmentIds,
    });

beforeAll(async () => {
  await connectSessionRedis();
  app = createApp();
});

afterEach(async () => {
  await Promise.all(createdUsers.splice(0).map(deleteUser));
});

describe("uploads", () => {
  it("stores an allowed file and returns its metadata", async () => {
    const user = await login();
    const res = await upload(user.cookie, Buffer.from("hello"));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      filename: "notes.txt",
      contentType: "text/plain",
      size: 5,
    });
  });

  it("rejects file types outside the allow-list", async () => {
    const user = await login();
    const res = await upload(
      user.cookie,
      Buffer.from("MZ"),
      "run.exe",
      "application/x-msdownload",
    );

    expect(res.status).toBe(415);
  });

  it("rejects files over 5 MB", async () => {
    const user = await login();
    const res = await upload(user.cookie, Buffer.alloc(5 * 1024 * 1024 + 1));

    expect(res.status).toBe(413);
  });

  it("requires login", async () => {
    const res = await request(app)
      .post("/api/attachments")
      .set("Origin", FRONTEND_ORIGIN)
      .attach("file", Buffer.from("x"), {
        filename: "a.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(401);
  });
});

describe("downloads", () => {
  it("serves the file as a download to its owner only", async () => {
    const owner = await login();
    const other = await login();
    const { body } = await upload(owner.cookie, Buffer.from("secret"));

    const asOwner = await request(app)
      .get(`/api/attachments/${body.id}`)
      .set("Cookie", owner.cookie);
    const asOther = await request(app)
      .get(`/api/attachments/${body.id}`)
      .set("Cookie", other.cookie);

    expect(asOwner.status).toBe(200);
    expect(asOwner.headers["content-disposition"]).toContain("attachment");
    expect(asOwner.headers["x-content-type-options"]).toBe("nosniff");
    expect(asOwner.text).toBe("secret");
    expect(asOther.status).toBe(404);
  });
});

describe("campaigns with attachments", () => {
  it("claims the upload, exposes it on the email and loads it for sending", async () => {
    const user = await login();
    const { body: file } = await upload(user.cookie, Buffer.from("data"));

    const created = await campaign(user.cookie, [file.id]);
    expect(created.status).toBe(201);

    const list = await request(app)
      .get("/api/emails?tab=scheduled")
      .set("Cookie", user.cookie);
    const detail = await request(app)
      .get(`/api/emails/${list.body.items[0].id}`)
      .set("Cookie", user.cookie);
    expect(detail.body.attachments).toEqual([file]);

    const files = await loadCampaignFiles(created.body.campaignId);
    expect(files).toHaveLength(1);
    expect(files[0]!.data.toString()).toBe("data");
  });

  it("refuses another user's attachment", async () => {
    const owner = await login();
    const other = await login();
    const { body: file } = await upload(owner.cookie, Buffer.from("data"));

    const res = await campaign(other.cookie, [file.id]);

    expect(res.status).toBe(400);
  });

  it("refuses an attachment already used by a campaign", async () => {
    const user = await login();
    const { body: file } = await upload(user.cookie, Buffer.from("data"));
    await campaign(user.cookie, [file.id]).expect(201);

    const res = await campaign(user.cookie, [file.id]);

    expect(res.status).toBe(400);
  });

  it("only lets an unclaimed upload be deleted", async () => {
    const user = await login();
    const { body: free } = await upload(user.cookie, Buffer.from("a"));
    const { body: used } = await upload(user.cookie, Buffer.from("b"));
    await campaign(user.cookie, [used.id]).expect(201);

    const del = (id: string) =>
      request(app)
        .delete(`/api/attachments/${id}`)
        .set("Cookie", user.cookie)
        .set("Origin", FRONTEND_ORIGIN);

    expect((await del(free.id)).status).toBe(204);
    expect((await del(used.id)).status).toBe(404);
  });
});

describe("stale upload cleanup", () => {
  it("deletes old unclaimed uploads but keeps claimed and recent ones", async () => {
    const user = await login();
    const { body: recent } = await upload(user.cookie, Buffer.from("a"));
    const { body: claimed } = await upload(user.cookie, Buffer.from("b"));
    await campaign(user.cookie, [claimed.id]).expect(201);

    // Cutoff in the future makes every unclaimed upload "old".
    await deleteStaleUnclaimedAttachments(new Date(Date.now() + 60_000));

    expect(await findOwnedAttachment(user.userId, recent.id)).toBeUndefined();
    expect(await findOwnedAttachment(user.userId, claimed.id)).toBeDefined();
  });

  it("keeps uploads newer than the cutoff", async () => {
    const user = await login();
    const { body: recent } = await upload(user.cookie, Buffer.from("a"));

    await deleteStaleUnclaimedAttachments(new Date(Date.now() - 60_000));

    expect(await findOwnedAttachment(user.userId, recent.id)).toBeDefined();
  });
});
