/**
 * Rebuilds the Elasticsearch index from MySQL (the source of truth).
 * Usage: npm run reindex            — upsert every email
 *        npm run reindex -- --reset — drop and recreate the index first (after mapping changes)
 */
import { asc, gt } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { emails } from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { EMAIL_INDEX, ensureEmailIndex, es } from "../search/client.js";
import { indexEmails } from "../search/indexer.js";

const BATCH_SIZE = 500;

try {
  if (process.argv.includes("--reset")) {
    await es.indices.delete({ index: EMAIL_INDEX, ignore_unavailable: true });
    logger.info({ index: EMAIL_INDEX }, "index dropped");
  }
  await ensureEmailIndex();

  let cursor = "";
  let total = 0;
  for (;;) {
    const batch = await db
      .select({ id: emails.id })
      .from(emails)
      .where(gt(emails.id, cursor))
      .orderBy(asc(emails.id))
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;
    const result = await indexEmails(batch.map((row) => row.id));
    total += result.indexed;
    cursor = batch[batch.length - 1]!.id;
  }
  await es.indices.refresh({ index: EMAIL_INDEX });
  logger.info({ index: EMAIL_INDEX, total }, "reindex complete");
} finally {
  await Promise.allSettled([pool.end(), es.close()]);
}
