import { migrate } from "drizzle-orm/mysql2/migrator";
import { db, pool } from "./client.js";
import { logger } from "../lib/logger.js";

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("migrations applied");
} finally {
  await pool.end();
}
