import { Router } from "express";
import type { MeResponse } from "@scheduler/shared";
import { db } from "../db/client.js";
import { HttpError } from "../lib/http-error.js";
import { currentUserId } from "../middleware/auth.js";

export const meRouter = Router();

meRouter.get("/", async (req, res) => {
  const userId = currentUserId(req);
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
  });
  if (!user) throw new HttpError(401, "Session user no longer exists");

  const slack = await db.query.slackConnections.findFirst({
    where: (s, { eq }) => eq(s.userId, userId),
  });

  const body: MeResponse = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    slackConnected: Boolean(slack),
  };
  res.json(body);
});
