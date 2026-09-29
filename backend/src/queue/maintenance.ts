import type { Job } from "bullmq";
import { expireLeases, scheduledEmailsAfter } from "../db/email-repo.js";
import { logger } from "../lib/logger.js";
import { enqueueEmails, maintenanceQueue } from "./queues.js";

const SWEEP_INTERVAL_MS = 60_000;
const RECONCILE_BATCH_SIZE = 500;
/** Scheduled emails this far overdue should already be in Redis; re-add them if not. */
const OVERDUE_GRACE_MS = 60_000;
const LEASE_SWEEP_JOB = "lease-sweep";

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
    if (expired > 0)
      logger.warn({ expired }, "expired email leases marked failed");
    await reconcileScheduledEmails(new Date(Date.now() - OVERDUE_GRACE_MS));
  } finally {
    await scheduleNextSweep();
  }
}
