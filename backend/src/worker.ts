import { Worker } from "bullmq";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { logger } from "./lib/logger.js";
import { bullOptions, redis } from "./lib/redis.js";
import { processEmailJob } from "./queue/email-processor.js";
import {
  processMaintenanceJob,
  reconcileScheduledEmails,
  scheduleNextSweep,
} from "./queue/maintenance.js";
import { processNotificationJob } from "./queue/notifications.js";
import { processSearchIndexJob, SEARCH_INDEX_QUEUE, searchIndexQueue } from "./queue/search-index.js";
import { ensureEmailIndex } from "./search/client.js";
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
  ...bullOptions(),
  concurrency: env.WORKER_CONCURRENCY,
  lockDuration: JOB_LOCK_DURATION_MS,
});
const maintenanceWorker = new Worker(MAINTENANCE_QUEUE, processMaintenanceJob, {
  ...bullOptions(),
});
// Separate queue so a slow or failing Slack call never holds up email sending.
const notificationWorker = new Worker(NOTIFICATION_QUEUE, processNotificationJob, {
  ...bullOptions(),
});
// Search indexing is secondary work on its own queue: an Elasticsearch outage delays
// search results but never email sending.
const searchIndexWorker = new Worker(SEARCH_INDEX_QUEUE, processSearchIndexJob, {
  ...bullOptions(),
});
const workers = [emailWorker, maintenanceWorker, notificationWorker, searchIndexWorker];

emailWorker.on("failed", (job, error) => {
  logger.warn(
    { jobId: job?.id, attemptsMade: job?.attemptsMade, err: error },
    "email job failed",
  );
});
for (const worker of workers) {
  worker.on("error", (error) => logger.error({ err: error }, "worker error"));
}

// Search is secondary: start without it and let indexing retry until Elasticsearch is up.
await ensureEmailIndex().catch((error: unknown) =>
  logger.warn({ err: error }, "elasticsearch unavailable at startup; search will recover when it is"),
);
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
    searchIndexQueue.close(),
    pool.end(),
    redis.quit(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
