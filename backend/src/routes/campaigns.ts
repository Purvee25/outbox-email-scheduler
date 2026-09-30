import { Router } from "express";
import { z } from "zod";
import { createCampaignSchema, listEmailsQuerySchema } from "@scheduler/shared";
import { parseOrThrow } from "../lib/validate.js";
import { currentUserId } from "../middleware/auth.js";
import { createCampaign } from "../services/campaigns.js";
import { HttpError } from "../lib/http-error.js";
import { getEmail, listEmails } from "../services/email-list.js";
import { setStarred, setArchived, deleteEmailRow } from "../db/email-repo.js";
import { emailQueue, emailJobId } from "../queue/queues.js";
import { requestIndexingSafely } from "../queue/search-index.js";

export const campaignsRouter = Router();

campaignsRouter.post("/", async (req, res) => {
  const input = parseOrThrow(createCampaignSchema, req.body);
  res.status(201).json(await createCampaign(currentUserId(req), input));
});

export const emailsRouter = Router();

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

emailsRouter.delete("/:id", async (req, res) => {
  const id = parseOrThrow(z.uuid(), req.params.id);
  const deleted = await deleteEmailRow(currentUserId(req), id);
  if (!deleted) throw new HttpError(404, "Email not found");
  await emailQueue.remove(emailJobId(id));
  requestIndexingSafely([id]);
  res.sendStatus(204);
});
