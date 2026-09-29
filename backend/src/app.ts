import { RedisStore } from "connect-redis";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import session from "express-session";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { SESSION_COOKIE_NAME, googleAuthRouter } from "./auth/google.js";
import { env, isProduction } from "./config/env.js";
import { pool } from "./db/client.js";
import { HttpError } from "./lib/http-error.js";
import { logger } from "./lib/logger.js";
import { redis, sessionRedis } from "./lib/redis.js";
import { requireAuth, requireTrustedOrigin } from "./middleware/auth.js";
import { campaignsRouter, emailsRouter } from "./routes/campaigns.js";
import { meRouter } from "./routes/me.js";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const BODY_LIMIT = "1mb";

export function createApp(): express.Express {
  const app = express();
  if (isProduction) app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/health" },
    }),
  );
  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      store: new RedisStore({
        client: sessionRedis,
        prefix: "sess:",
        ttl: SESSION_TTL_SECONDS,
      }),
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: SESSION_TTL_SECONDS * 1000,
      },
    }),
  );
  app.use(requireTrustedOrigin);

  app.get("/health", async (_req, res) => {
    const checks = await Promise.allSettled([
      pool.query("SELECT 1"),
      redis.ping(),
    ]);
    const [mysql, redisCheck] = checks.map((check) =>
      check.status === "fulfilled" ? "ok" : "down",
    );
    const healthy = checks.every((check) => check.status === "fulfilled");
    res
      .status(healthy ? 200 : 503)
      .json({ status: healthy ? "ok" : "degraded", mysql, redis: redisCheck });
  });

  app.use("/auth", googleAuthRouter);
  app.use("/api/me", requireAuth, meRouter);
  app.use("/api/campaigns", requireAuth, campaignsRouter);
  app.use("/api/emails", requireAuth, emailsRouter);

  app.use((_req, _res, next) => next(new HttpError(404, "Not found")));
  app.use(
    (error: unknown, req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      req.log.error({ err: error }, "unhandled error");
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
