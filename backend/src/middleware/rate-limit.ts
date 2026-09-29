import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { sessionRedis } from "../lib/redis.js";

const MINUTE_MS = 60_000;
const AUTH_REQUESTS_PER_MINUTE = 20;
const CAMPAIGNS_PER_MINUTE = 10;

// Counters live in Redis so limits hold across API instances.
const redisStore = (prefix: string) =>
  new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => sessionRedis.sendCommand(args),
  });

/** Must be called after `sessionRedis` is connected (the store loads a script on creation). */
export function createRateLimiters() {
  return {
    auth: rateLimit({
      windowMs: MINUTE_MS,
      limit: AUTH_REQUESTS_PER_MINUTE,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      store: redisStore("rl-api:auth:"),
      message: { error: "Too many login attempts, try again in a minute" },
    }),
    // Keyed per user: used only behind requireAuth.
    createCampaign: rateLimit({
      windowMs: MINUTE_MS,
      limit: CAMPAIGNS_PER_MINUTE,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      keyGenerator: (req) => req.session.userId ?? "anonymous",
      store: redisStore("rl-api:campaigns:"),
      message: { error: "Too many campaigns scheduled, try again in a minute" },
    }),
  };
}
