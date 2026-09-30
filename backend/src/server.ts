import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { logger } from "./lib/logger.js";
import { redis, sessionRedis } from "./lib/redis.js";
import { ensureEmailIndex } from "./search/client.js";

await sessionRedis.connect();
// Search is secondary: start without it and let indexing retry until Elasticsearch is up.
await ensureEmailIndex().catch((error: unknown) =>
  logger.warn({ err: error }, "elasticsearch unavailable at startup; search will recover when it is"),
);

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "api listening");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down api");
  server.close();
  await Promise.allSettled([pool.end(), redis.quit(), sessionRedis.quit()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
