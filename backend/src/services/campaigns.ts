import { randomUUID } from "node:crypto";
import type {
  CreateCampaignInput,
  CreateCampaignResponse,
} from "@scheduler/shared";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { campaigns, emails } from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { senderAddresses } from "../mail/senders.js";
import { enqueueEmails } from "../queue/queues.js";
import { requestIndexingSafely } from "../queue/search-index.js";
import { normalizeRecipients, planSends } from "../scheduling/plan-sends.js";

const INSERT_CHUNK_SIZE = 500;

/**
 * Persists a campaign and one row per recipient, then enqueues a delayed job per email.
 * MySQL is written first and is the source of truth: if enqueueing fails after the commit,
 * the worker's reconciliation re-adds the missing jobs, so the request still succeeds.
 */
export async function createCampaign(
  userId: string,
  input: CreateCampaignInput,
): Promise<CreateCampaignResponse> {
  const recipients = normalizeRecipients(input.recipients);
  // A campaign cannot exceed what its senders are allowed to send per hour in total.
  const effectiveHourlyLimit = Math.min(
    input.hourlyLimit,
    env.MAX_EMAILS_PER_HOUR_PER_SENDER * senderAddresses.length,
  );
  const startAt = new Date(Math.max(Date.parse(input.startAt), Date.now()));

  const plan = planSends(recipients, {
    startAt,
    delayMs: input.delayMs,
    hourlyLimit: effectiveHourlyLimit,
    senders: senderAddresses,
  });

  const campaignId = randomUUID();
  const rows = plan.map((send) => ({
    id: randomUUID(),
    campaignId,
    userId,
    ...send,
  }));

  await db.transaction(async (tx) => {
    await tx.insert(campaigns).values({
      id: campaignId,
      userId,
      subject: input.subject,
      body: input.body,
      startAt,
      delayMs: input.delayMs,
      hourlyLimit: effectiveHourlyLimit,
    });
    for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
      await tx
        .insert(emails)
        .values(rows.slice(offset, offset + INSERT_CHUNK_SIZE));
    }
  });

  try {
    await enqueueEmails(rows);
  } catch (error) {
    logger.error({ err: error, campaignId }, "enqueue failed after commit; reconciliation will recover");
  }
  requestIndexingSafely(rows.map((row) => row.id));

  return {
    campaignId,
    scheduledCount: rows.length,
    duplicatesRemoved: input.recipients.length - recipients.length,
    firstSendAt: rows[0]!.scheduledAt.toISOString(),
    lastSendAt: rows[rows.length - 1]!.scheduledAt.toISOString(),
    effectiveHourlyLimit,
  };
}
