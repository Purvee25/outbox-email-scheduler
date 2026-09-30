import { Redis } from "ioredis";
import { createClient } from "redis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * ioredis connection for BullMQ and rate-limit counters.
 * BullMQ requires `maxRetriesPerRequest: null` on connections used by workers.
 */
export function createBullConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

/** Connection + key prefix for every BullMQ Queue and Worker. */
export function bullOptions() {
  return { connection: createBullConnection(), prefix: env.QUEUE_PREFIX };
}

/** Shared ioredis client for rate limiting and other app keys. */
export const redis = createBullConnection();

/** node-redis client for the session store (connect-redis only supports node-redis). */
export const sessionRedis = createClient({ url: env.REDIS_URL });
sessionRedis.on("error", (error) =>
  logger.error({ err: error }, "session redis error"),
);
