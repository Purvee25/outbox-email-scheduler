import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { logger } from "./lib/logger.js";
import { redis, sessionRedis } from "./lib/redis.js";

await sessionRedis.connect();

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "api listening");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down api");
  server.close();
  await Promise.allSettled([pool.end(), redis.quit(), sessionRedis.quit()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
