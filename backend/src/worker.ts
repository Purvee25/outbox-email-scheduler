import { Worker } from "bullmq";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { logger } from "./lib/logger.js";
import { createBullConnection, redis } from "./lib/redis.js";
import { processEmailJob } from "./queue/email-processor.js";
import {
  processMaintenanceJob,
  reconcileScheduledEmails,
  scheduleNextSweep,
} from "./queue/maintenance.js";
import { processNotificationJob } from "./queue/notifications.js";
import {
  EMAIL_QUEUE,
  MAINTENANCE_QUEUE,
  NOTIFICATION_QUEUE,
  emailQueue,
  maintenanceQueue,
  notificationQueue,
  type EmailJobData,
} from "./queue/queues.js";

/** Must exceed the SMTP timeouts; BullMQ renews the lock while the job runs. */
const JOB_LOCK_DURATION_MS = 60_000;

const emailWorker = new Worker<EmailJobData>(EMAIL_QUEUE, processEmailJob, {
  connection: createBullConnection(),
  concurrency: env.WORKER_CONCURRENCY,
  lockDuration: JOB_LOCK_DURATION_MS,
});
const maintenanceWorker = new Worker(MAINTENANCE_QUEUE, processMaintenanceJob, {
  connection: createBullConnection(),
});
// Separate queue so a slow or failing Slack call never holds up email sending.
const notificationWorker = new Worker(NOTIFICATION_QUEUE, processNotificationJob, {
  connection: createBullConnection(),
});
const workers = [emailWorker, maintenanceWorker, notificationWorker];

emailWorker.on("failed", (job, error) => {
  logger.warn(
    { jobId: job?.id, attemptsMade: job?.attemptsMade, err: error },
    "email job failed",
  );
});
for (const worker of workers) {
  worker.on("error", (error) => logger.error({ err: error }, "worker error"));
}

const reconciled = await reconcileScheduledEmails();
await scheduleNextSweep();
logger.info(
  { concurrency: env.WORKER_CONCURRENCY, reconciled },
  "worker started",
);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down worker; waiting for active jobs");
  await Promise.allSettled(workers.map((worker) => worker.close()));
  await Promise.allSettled([
    emailQueue.close(),
    maintenanceQueue.close(),
    notificationQueue.close(),
    pool.end(),
    redis.quit(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
