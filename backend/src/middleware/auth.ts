import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Rejects requests without a logged-in session. */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.session.userId) {
    next(new HttpError(401, "Not authenticated"));
    return;
  }
  next();
}

/** Returns the session's user id; call only behind `requireAuth`. */
export function currentUserId(req: Request): string {
  const userId = req.session.userId;
  if (!userId) throw new HttpError(401, "Not authenticated");
  return userId;
}

/**
 * CSRF defence in depth on top of SameSite=Lax cookies: state-changing requests
 * must come from the frontend origin.
 */
export function requireTrustedOrigin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = req.get("origin");
  if (origin !== env.FRONTEND_ORIGIN) {
    next(new HttpError(403, "Untrusted origin"));
    return;
  }
  next();
}
