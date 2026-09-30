import { Router } from "express";
import { z } from "zod";
import { createCampaignSchema, listEmailsQuerySchema } from "@scheduler/shared";
import { parseOrThrow } from "../lib/validate.js";
import { currentUserId } from "../middleware/auth.js";
import { createCampaign } from "../services/campaigns.js";
import { HttpError } from "../lib/http-error.js";
import { getEmail, listEmails } from "../services/email-list.js";
import {
  setStarred,
  setArchived,
  deleteEmailRow,
  getEmailStats,
  retryEmail,
} from "../db/email-repo.js";
import { emailQueue, emailJobId } from "../queue/queues.js";
import { requestIndexingSafely } from "../queue/search-index.js";

export const campaignsRouter = Router();

campaignsRouter.post("/", async (req, res) => {
  const input = parseOrThrow(createCampaignSchema, req.body);
  res.status(201).json(await createCampaign(currentUserId(req), input));
});

export const emailsRouter = Router();

emailsRouter.get("/stats", async (req, res) => {
  res.json(await getEmailStats(currentUserId(req)));
});

emailsRouter.get("/", async (req, res) => {
  const query = parseOrThrow(listEmailsQuerySchema, req.query);
  res.json(await listEmails(currentUserId(req), query));
});

emailsRouter.get("/:id", async (req, res) => {
  const id = parseOrThrow(z.uuid(), req.params.id);
  const email = await getEmail(currentUserId(req), id);
  if (!email) throw new HttpError(404, "Email not found");
  res.json(email);
});

emailsRouter.put("/:id/star", async (req, res) => {
  const id = parseOrThrow(z.uuid(), req.params.id);
  const starred = parseOrThrow(z.boolean(), req.body.starred);
  const updated = await setStarred(currentUserId(req), id, starred);
  if (!updated) throw new HttpError(404, "Email not found");
  requestIndexingSafely([id]);
  res.sendStatus(204);
});

emailsRouter.put("/:id/archive", async (req, res) => {
  const id = parseOrThrow(z.uuid(), req.params.id);
  const archived = parseOrThrow(z.boolean(), req.body.archived);
  const updated = await setArchived(currentUserId(req), id, archived);
  if (!updated) throw new HttpError(404, "Email not found");
  requestIndexingSafely([id]);
  res.sendStatus(204);
});

emailsRouter.post("/:id/retry", async (req, res) => {
  const id = parseOrThrow(z.uuid(), req.params.id);
  const ok = await retryEmail(currentUserId(req), id);
  if (!ok)
    throw new HttpError(409, "Email is not in a failed state or was not found");
  const jobId = emailJobId(id);
  await emailQueue.add("send-email", { emailId: id }, { jobId, delay: 0 });
  res.sendStatus(204);
});

emailsRouter.delete("/:id", async (req, res) => {
  const id = parseOrThrow(z.uuid(), req.params.id);
  const result = await deleteEmailRow(currentUserId(req), id);
  if (result === "not_found") throw new HttpError(404, "Email not found");
  if (result === "sending") {
    throw new HttpError(
      409,
      "This email is being sent right now and can't be deleted",
    );
  }
  // Tidies the queue; the missing row alone already guarantees the job won't send.
  await emailQueue.remove(emailJobId(id));
  requestIndexingSafely([id]);
  res.sendStatus(204);
});
