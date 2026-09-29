import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { createBullConnection } from "../lib/redis.js";

export const EMAIL_QUEUE = "email-send";
export const MAINTENANCE_QUEUE = "maintenance";
export const NOTIFICATION_QUEUE = "notifications";

const ENQUEUE_CHUNK_SIZE = 500;
const RETRY_BACKOFF_MS = 5_000;
const KEEP_COMPLETED_SECONDS = 24 * 60 * 60;
const KEEP_FAILED_SECONDS = 7 * 24 * 60 * 60;

export interface EmailJobData {
  emailId: string;
  /** Send time reserved by the rate limiter; set when the job was deferred to its slot. */
  reservedAt?: number;
}

/** Deterministic job id: re-adding an email that already has a job is a no-op. */
export const emailJobId = (emailId: string): string => `email-${emailId}`;

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: createBullConnection(),
  defaultJobOptions: {
    attempts: env.MAX_SEND_ATTEMPTS,
    backoff: { type: "exponential", delay: RETRY_BACKOFF_MS },
    removeOnComplete: { age: KEEP_COMPLETED_SECONDS, count: 1000 },
    removeOnFail: { age: KEEP_FAILED_SECONDS },
  },
});

export const notificationQueue = new Queue(NOTIFICATION_QUEUE, {
  connection: createBullConnection(),
});

export const maintenanceQueue = new Queue(MAINTENANCE_QUEUE, {
  connection: createBullConnection(),
});

export interface EnqueueableEmail {
  id: string;
  scheduledAt: Date;
}

/** Adds one delayed job per email. Emails that already have a job are left untouched. */
export async function enqueueEmails(
  rows: readonly EnqueueableEmail[],
  now: number = Date.now(),
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += ENQUEUE_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + ENQUEUE_CHUNK_SIZE);
    await emailQueue.addBulk(
      chunk.map((row) => ({
        name: "send",
        data: { emailId: row.id },
        opts: {
          jobId: emailJobId(row.id),
          delay: Math.max(0, row.scheduledAt.getTime() - now),
        },
      })),
    );
  }
}
