import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { slackConnections } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { HttpError } from "../lib/http-error.js";
import { logger } from "../lib/logger.js";

const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const SLACK_API_URL = "https://slack.com/api";
const SLACK_SCOPES = "incoming-webhook";
const SLACK_TIMEOUT_MS = 10_000;
/** Webhook responses meaning the installation/channel is gone; retrying will not help. */
const WEBHOOK_GONE_STATUSES = new Set([403, 404, 410]);

export const SLACK_REDIRECT_URI = new URL(
  "/api/slack/callback",
  env.API_PUBLIC_URL,
).toString();

function slackCredentials() {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    throw new HttpError(503, "Slack integration is not configured");
  }
  return {
    clientId: env.SLACK_CLIENT_ID,
    clientSecret: env.SLACK_CLIENT_SECRET,
  };
}

export function slackAuthorizeUrl(state: string): string {
  const url = new URL(SLACK_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: slackCredentials().clientId,
    scope: SLACK_SCOPES,
    redirect_uri: SLACK_REDIRECT_URI,
    state,
  }).toString();
  return url.toString();
}

const oauthAccessSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    access_token: z.string().min(1),
    team: z.object({ name: z.string() }).nullish(),
    incoming_webhook: z.object({ url: z.url(), channel: z.string() }),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

/** Exchanges the OAuth code and stores the webhook for this user (replacing any previous one). */
export async function connectSlack(
  userId: string,
  code: string,
): Promise<void> {
  const { clientId, clientSecret } = slackCredentials();
  const response = await fetch(`${SLACK_API_URL}/oauth.v2.access`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: SLACK_REDIRECT_URI,
    }),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  const result = oauthAccessSchema.parse(await response.json());
  if (!result.ok)
    throw new HttpError(400, `Slack authorization failed: ${result.error}`);

  const connection = {
    webhookUrlEnc: encryptSecret(result.incoming_webhook.url),
    accessTokenEnc: encryptSecret(result.access_token),
    channel: result.incoming_webhook.channel,
    teamName: result.team?.name ?? null,
    connectedAt: new Date(),
  };
  await db
    .insert(slackConnections)
    .values({ userId, ...connection })
    .onDuplicateKeyUpdate({ set: connection });
}

/** Revokes the installation in Slack (best effort) and forgets the webhook. */
export async function disconnectSlack(userId: string): Promise<void> {
  const connection = await db.query.slackConnections.findFirst({
    where: eq(slackConnections.userId, userId),
  });
  if (!connection) return;

  try {
    await fetch(`${SLACK_API_URL}/auth.revoke`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${decryptSecret(connection.accessTokenEnc)}`,
      },
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });
  } catch (error) {
    logger.warn(
      { err: error, userId },
      "slack token revoke failed; removing connection anyway",
    );
  }
  await db.delete(slackConnections).where(eq(slackConnections.userId, userId));
}

export type SlackPostResult = "sent" | "not_connected" | "disconnected";

/**
 * Posts a message to the user's connected channel. Missing connections are a no-op, and a
 * webhook Slack reports as gone is removed so later alerts skip it until the user reconnects.
 * Other failures throw so the notification job retries.
 */
export async function postToUserSlack(
  userId: string,
  text: string,
): Promise<SlackPostResult> {
  const connection = await db.query.slackConnections.findFirst({
    where: eq(slackConnections.userId, userId),
  });
  if (!connection) return "not_connected";

  const response = await fetch(decryptSecret(connection.webhookUrlEnc), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  if (response.ok) return "sent";

  const reason = await response.text();
  if (WEBHOOK_GONE_STATUSES.has(response.status)) {
    // Match on the ciphertext too, so a fresh reconnect made meanwhile is not deleted.
    await db
      .delete(slackConnections)
      .where(
        and(
          eq(slackConnections.userId, userId),
          eq(slackConnections.webhookUrlEnc, connection.webhookUrlEnc),
        ),
      );
    logger.warn(
      { userId, status: response.status, reason },
      "slack webhook revoked; connection removed",
    );
    return "disconnected";
  }
  throw new Error(`Slack webhook returned ${response.status}: ${reason}`);
}
