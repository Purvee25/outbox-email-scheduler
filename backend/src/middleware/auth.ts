import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
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

/** Allows only users whose email is listed in ADMIN_EMAILS; use after `requireAuth`. */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const user = await db.query.users.findFirst({
    columns: { email: true },
    where: (u, { eq }) => eq(u.id, currentUserId(req)),
  });
  const admins = new Set(env.ADMIN_EMAILS.map((email) => email.toLowerCase()));
  if (!user || !admins.has(user.email.toLowerCase())) {
    next(new HttpError(403, "Admin access required"));
    return;
  }
  next();
}
