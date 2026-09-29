import { randomUUID } from "node:crypto";
import { DelayedError, UnrecoverableError, type Job } from "bullmq";
import { env } from "../config/env.js";
import {
  claimEmail,
  findEmailForSend,
  markFailed,
  markSent,
  recordAttempt,
  releaseClaim,
} from "../db/email-repo.js";
import { logger } from "../lib/logger.js";
import { redis } from "../lib/redis.js";
import { isPermanentSmtpError, sendEmail } from "../mail/transport.js";
import { acquireSendTurn, reserveSendSlot } from "../scheduling/send-slots.js";
import type { EmailJobData } from "./queues.js";

/** Longer than SMTP timeouts plus lock renewal, so a live worker never loses its lease. */
export const LEASE_MS = 5 * 60 * 1000;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Processes one email job:
 *   claim (idempotency) → reserve a send slot (min gap + hourly limit)
 *   → take the sender's send turn (exact min gap at send time) → send → record.
 * If the job must wait, the claim is released and the job is moved to the delayed set
 * (keeping its reserved slot) — the processor never sleeps and never re-adds the job.
 */
export async function processEmailJob(
  job: Job<EmailJobData>,
  token?: string,
): Promise<void> {
  const { emailId } = job.data;
  const leaseToken = randomUUID();

  if (!(await claimEmail(emailId, leaseToken, LEASE_MS))) {
    logger.info({ emailId }, "email already claimed or finished; skipping");
    return;
  }

  let sendAt: number;
  let waitMs: number;
  let email: Awaited<ReturnType<typeof findEmailForSend>>;
  try {
    email = await findEmailForSend(emailId);
    if (!email) {
      logger.warn({ emailId }, "email row missing; dropping job");
      return;
    }
    sendAt = await resolveSendSlot(job, email.sender);
    const now = Date.now();
    waitMs =
      sendAt > now
        ? sendAt - now
        : await acquireSendTurn(redis, email.sender, env.MIN_DELAY_MS, now);
  } catch (error) {
    await releaseClaim(emailId, leaseToken);
    throw error;
  }

  if (waitMs > 0) {
    const wakeAt = Date.now() + waitMs;
    await releaseClaim(emailId, leaseToken, { scheduledAt: new Date(wakeAt) });
    await job.updateData({ emailId, reservedAt: sendAt });
    await job.moveToDelayed(wakeAt, token);
    throw new DelayedError();
  }

  const attempts = await recordAttempt(emailId, leaseToken);
  try {
    const result = await sendEmail({
      emailId,
      from: email.sender,
      to: email.recipient,
      subject: email.subject,
      text: email.body,
    });
    await markSent(emailId, leaseToken, result);
    logger.info({ emailId, sender: email.sender, attempts }, "email sent");
  } catch (error) {
    await handleSendFailure(job, leaseToken, attempts, error);
  }
}

async function resolveSendSlot(
  job: Job<EmailJobData>,
  sender: string,
): Promise<number> {
  if (job.data.reservedAt !== undefined) return job.data.reservedAt;

  const reservation = await reserveSendSlot(redis, sender, {
    minDelayMs: env.MIN_DELAY_MS,
    maxPerHour: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
  });
  if (reservation.hourlyLimitHit) {
    logger.warn(
      {
        emailId: job.data.emailId,
        sender,
        sendAt: new Date(reservation.sendAt).toISOString(),
      },
      "hourly limit reached for sender; email moved to next window",
    );
  }
  return reservation.sendAt;
}

async function handleSendFailure(
  job: Job<EmailJobData>,
  leaseToken: string,
  attempts: number,
  error: unknown,
): Promise<never> {
  const { emailId } = job.data;
  const message = errorMessage(error);
  // Drop the used reservation so a retry reserves a fresh slot and still respects the limits.
  await job.updateData({ emailId });

  if (isPermanentSmtpError(error) || attempts >= env.MAX_SEND_ATTEMPTS) {
    await markFailed(emailId, leaseToken, message);
    logger.error({ emailId, attempts, err: error }, "email failed permanently");
    throw new UnrecoverableError(message);
  }

  await releaseClaim(emailId, leaseToken, { error: message });
  logger.warn(
    { emailId, attempts, err: error },
    "email send failed; will retry",
  );
  throw error;
}
