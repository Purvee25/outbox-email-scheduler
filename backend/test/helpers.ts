import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { users } from "../src/db/schema.js";
import { sessionRedis } from "../src/lib/redis.js";

export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN!;

export async function connectSessionRedis(): Promise<void> {
  if (!sessionRedis.isOpen) await sessionRedis.connect();
}

/** Signs a session id the way express-session does, producing a valid `sid` cookie. */
function signedCookie(sessionId: string): string {
  const signature = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(sessionId)
    .digest("base64")
    .replace(/=+$/, "");
  return `sid=${encodeURIComponent(`s:${sessionId}.${signature}`)}`;
}

/** Creates a user plus a logged-in session, bypassing Google (which cannot run in tests). */
export async function createLoggedInUser(
  email = `${randomUUID()}@scheduler.test`,
) {
  const userId = randomUUID();
  await db
    .insert(users)
    .values({
      id: userId,
      googleId: `test-${userId}`,
      email,
      name: "Test User",
    });
  const sessionId = randomUUID();
  await sessionRedis.set(
    `sess:${sessionId}`,
    JSON.stringify({
      cookie: { path: "/", httpOnly: true, sameSite: "lax" },
      userId,
    }),
    { EX: 3600 },
  );
  return { userId, cookie: signedCookie(sessionId) };
}

export async function deleteUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

/** Minimal stand-in for fetch's Response. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
