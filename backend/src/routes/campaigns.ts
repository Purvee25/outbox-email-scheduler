import { Router } from "express";
import { createCampaignSchema, listEmailsQuerySchema } from "@scheduler/shared";
import { parseOrThrow } from "../lib/validate.js";
import { currentUserId } from "../middleware/auth.js";
import { createCampaign } from "../services/campaigns.js";
import { listEmails } from "../services/email-list.js";

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
