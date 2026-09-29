import type { Job } from "bullmq";
import { logger } from "../lib/logger.js";
import { postToUserSlack } from "../slack/slack.js";
import { notificationQueue } from "./queues.js";

export const RATE_LIMIT_HIT_JOB = "rate-limit-hit";
const NOTIFY_ATTEMPTS = 3;
const NOTIFY_BACKOFF_MS = 5_000;
/** Keep completed ids for longer than a window so duplicates within the window are ignored. */
const KEEP_COMPLETED_SECONDS = 2 * 60 * 60;

export interface RateLimitHitData {
  userId: string;
  sender: string;
  window: number;
  limit: number;
  resumesAt: string;
}

export function rateLimitMessage({
  sender,
  limit,
  resumesAt,
}: RateLimitHitData): string {
  const resumeTime = resumesAt.slice(11, 16);
  return (
    `:warning: *Hourly sending limit reached* for \`${sender}\` (${limit} emails/hour).\n` +
    `Remaining emails for this sender are queued, not dropped, and resume at ${resumeTime} UTC.`
  );
}

/**
 * Queues one Slack alert per user, sender and hour window. The deterministic job id makes
 * repeated limit hits within the same window a no-op, so users get one message, not hundreds.
 */
export async function notifyRateLimitHit(
  data: RateLimitHitData,
): Promise<void> {
  await notificationQueue.add(RATE_LIMIT_HIT_JOB, data, {
    jobId: `rate-limit-${data.userId}-${data.sender}-${data.window}`,
    attempts: NOTIFY_ATTEMPTS,
    backoff: { type: "exponential", delay: NOTIFY_BACKOFF_MS },
    removeOnComplete: { age: KEEP_COMPLETED_SECONDS },
    removeOnFail: { age: KEEP_COMPLETED_SECONDS },
  });
}

export async function processNotificationJob(
  job: Job<RateLimitHitData>,
): Promise<void> {
  if (job.name !== RATE_LIMIT_HIT_JOB) return;
  const result = await postToUserSlack(
    job.data.userId,
    rateLimitMessage(job.data),
  );
  logger.info(
    { userId: job.data.userId, sender: job.data.sender, result },
    "rate-limit notification processed",
  );
}
