import { Queue, type Job } from "bullmq";
import { bullOptions } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { indexEmails } from "../search/indexer.js";

export const SEARCH_INDEX_QUEUE = "search-index";
const INDEX_CHUNK_SIZE = 500;
const INDEX_ATTEMPTS = 8;
const INDEX_BACKOFF_MS = 2_000;

export interface SearchIndexJobData {
  emailIds: string[];
}

export const searchIndexQueue = new Queue<SearchIndexJobData>(
  SEARCH_INDEX_QUEUE,
  {
    ...bullOptions(),
    defaultJobOptions: {
      // Exponential backoff over several minutes rides out a short Elasticsearch outage.
      attempts: INDEX_ATTEMPTS,
      backoff: { type: "exponential", delay: INDEX_BACKOFF_MS },
      removeOnComplete: { count: 1000 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  },
);

/** Queues emails for (re)indexing. Jobs carry only ids; the indexer reads current state. */
export async function requestIndexing(
  emailIds: readonly string[],
): Promise<void> {
  for (let offset = 0; offset < emailIds.length; offset += INDEX_CHUNK_SIZE) {
    await searchIndexQueue.add("index", {
      emailIds: emailIds.slice(offset, offset + INDEX_CHUNK_SIZE),
    });
  }
}

/**
 * Fire-and-forget variant for hot paths (sending): search is secondary, so a Redis hiccup
 * here is logged rather than failing the send. `npm run reindex` repairs any gap.
 */
export function requestIndexingSafely(emailIds: readonly string[]): void {
  requestIndexing(emailIds).catch((error: unknown) =>
    logger.error(
      { err: error, count: emailIds.length },
      "failed to queue search indexing",
    ),
  );
}

export async function processSearchIndexJob(
  job: Job<SearchIndexJobData>,
): Promise<void> {
  const result = await indexEmails(job.data.emailIds);
  logger.debug({ ...result }, "search index updated");
}
