import { Router } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { logger } from "../lib/logger.js";
import { createOAuthState, oauthStatesMatch } from "../lib/oauth-state.js";
import { currentUserId } from "../middleware/auth.js";
import {
  connectSlack,
  disconnectSlack,
  postToUserSlack,
  slackAuthorizeUrl,
} from "../slack/slack.js";

const dashboardUrl = (slackStatus: string) =>
  `${env.FRONTEND_ORIGIN}/dashboard?slack=${slackStatus}`;

export const slackRouter = Router();

/** Starts the Slack OAuth flow; the dashboard links here with a normal top-level navigation. */
slackRouter.get("/connect", (req, res) => {
  const state = createOAuthState();
  const url = slackAuthorizeUrl(state);
  req.session.slackState = state;
  res.redirect(url);
});

slackRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const expectedState = req.session.slackState;
  delete req.session.slackState;

  if (error) {
    res.redirect(dashboardUrl("denied"));
    return;
  }
  if (!oauthStatesMatch(expectedState, state) || typeof code !== "string") {
    logger.warn({ userId: req.session.userId }, "slack oauth state mismatch");
    res.redirect(dashboardUrl("error"));
    return;
  }

  try {
    await connectSlack(currentUserId(req), code);
    res.redirect(dashboardUrl("connected"));
  } catch (exchangeError) {
    logger.error({ err: exchangeError }, "slack oauth exchange failed");
    res.redirect(dashboardUrl("error"));
  }
});

slackRouter.delete("/", async (req, res) => {
  await disconnectSlack(currentUserId(req));
  res.status(204).end();
});

/** Sends a test message so the user can verify the connection from the dashboard. */
slackRouter.post("/test", async (req, res) => {
  const result = await postToUserSlack(
    currentUserId(req),
    ":white_check_mark: ReachInbox scheduler is connected. Rate-limit alerts will appear here.",
  );
  if (result !== "sent") throw new HttpError(409, "Slack is not connected");
  res.status(204).end();
});
