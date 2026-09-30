import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.url(),
  API_PUBLIC_URL: z.url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  // Key prefix for all BullMQ queues; tests use their own so they never touch dev queues.
  QUEUE_PREFIX: z.string().min(1).default("bull"),
  ELASTICSEARCH_URL: z.url(),
  ELASTICSEARCH_INDEX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "must be a lowercase index name")
    .default("emails"),

  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "must be 32 bytes as hex"),

  // OAuth credentials are optional at boot so the API runs before the apps are created;
  // the matching routes respond 503 until they are set.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),

  // "ethereal" sends real SMTP to Ethereal; "log" records messages without a network call
  // (local runs and load tests, where sending thousands via Ethereal is unnecessary).
  MAIL_TRANSPORT: z.enum(["ethereal", "log"]).default("ethereal"),
  ETHEREAL_SENDERS: csv,
  ADMIN_EMAILS: csv,

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  MIN_DELAY_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(200),
  MAX_SEND_ATTEMPTS: z.coerce.number().int().min(1).default(3),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `  ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === "production";
