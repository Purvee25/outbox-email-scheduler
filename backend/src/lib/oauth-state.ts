import { randomBytes, timingSafeEqual } from "node:crypto";

const STATE_BYTES = 32;

/** Random, unguessable OAuth `state` value (CSRF protection for redirects). */
export function createOAuthState(): string {
  return randomBytes(STATE_BYTES).toString("hex");
}

/** Constant-time comparison of the stored state with the one returned by the provider. */
export function oauthStatesMatch(
  expected: string | undefined,
  received: unknown,
): boolean {
  if (
    !expected ||
    typeof received !== "string" ||
    expected.length !== received.length
  )
    return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
