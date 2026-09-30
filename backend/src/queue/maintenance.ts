import type { Job } from "bullmq";
import { deleteStaleUnclaimedAttachments } from "../db/attachment-repo.js";
import { expireLeases, scheduledEmailsAfter } from "../db/email-repo.js";
import { logger } from "../lib/logger.js";
import { enqueueEmails, maintenanceQueue } from "./queues.js";
import { requestIndexing } from "./search-index.js";

const SWEEP_INTERVAL_MS = 60_000;
const RECONCILE_BATCH_SIZE = 500;
/** Scheduled emails this far overdue should already be in Redis; re-add them if not. */
const OVERDUE_GRACE_MS = 60_000;
const LEASE_SWEEP_JOB = "lease-sweep";
/** Uploads not used by a campaign within this window are deleted by the sweep. */
export const UNCLAIMED_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Re-enqueues `scheduled` rows from MySQL (the source of truth). Rows that already have a
 * job are skipped by BullMQ because job ids are deterministic. Covers Redis data loss and a
 * crash between the DB commit and the enqueue.
 */
export async function reconcileScheduledEmails(
  dueBefore?: Date,
): Promise<number> {
  let cursor = "";
  let checked = 0;
  for (;;) {
    const batch = await scheduledEmailsAfter(
      cursor,
      RECONCILE_BATCH_SIZE,
      dueBefore,
    );
    if (batch.length === 0) break;
    await enqueueEmails(batch);
    checked += batch.length;
    cursor = batch[batch.length - 1]!.id;
  }
  return checked;
}

/**
 * Schedules the next sweep as a delayed job. The job id is derived from the run time so
 * several workers scheduling the same sweep produce a single job. No cron involved.
 */
export async function scheduleNextSweep(
  now: number = Date.now(),
): Promise<void> {
  const runAt = (Math.floor(now / SWEEP_INTERVAL_MS) + 1) * SWEEP_INTERVAL_MS;
  await maintenanceQueue.add(
    LEASE_SWEEP_JOB,
    {},
    {
      jobId: `${LEASE_SWEEP_JOB}-${runAt}`,
      delay: runAt - now,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

export async function processMaintenanceJob(job: Job): Promise<void> {
  if (job.name !== LEASE_SWEEP_JOB) return;
  try {
    const expired = await expireLeases();
    if (expired.length > 0) {
      logger.warn(
        { expired: expired.length },
        "expired email leases marked failed",
      );
      await requestIndexing(expired);
    }
    await reconcileScheduledEmails(new Date(Date.now() - OVERDUE_GRACE_MS));
    const removed = await deleteStaleUnclaimedAttachments(
      new Date(Date.now() - UNCLAIMED_ATTACHMENT_TTL_MS),
    );
    if (removed > 0) logger.info({ removed }, "deleted unclaimed attachment uploads");
  } finally {
    await scheduleNextSweep();
  }
}
