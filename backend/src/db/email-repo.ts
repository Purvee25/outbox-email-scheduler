import { and, asc, eq, gt, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "./client.js";
import { campaigns, emails } from "./schema.js";

const ERROR_MAX_LENGTH = 2000;
export const LEASE_EXPIRED_ERROR =
  "Delivery outcome unknown: the worker stopped while sending. Not retried, to avoid a duplicate email.";

const truncate = (message: string) => message.slice(0, ERROR_MAX_LENGTH);

/**
 * Atomically moves a `scheduled` email to `sending` under a lease.
 * Returns false when another worker already claimed it or it was already sent/failed —
 * this conditional update is what makes processing idempotent.
 */
export async function claimEmail(
  emailId: string,
  leaseToken: string,
  leaseMs: number,
): Promise<boolean> {
  const [result] = await db
    .update(emails)
    .set({
      status: "sending",
      leaseToken,
      leaseExpiresAt: new Date(Date.now() + leaseMs),
    })
    .where(and(eq(emails.id, emailId), eq(emails.status, "scheduled")));
  return result.affectedRows === 1;
}

/** Returns a claimed email to `scheduled`, optionally with a new send time and error note. */
export async function releaseClaim(
  emailId: string,
  leaseToken: string,
  changes: { scheduledAt?: Date; error?: string } = {},
): Promise<void> {
  await db
    .update(emails)
    .set({
      status: "scheduled",
      leaseToken: null,
      leaseExpiresAt: null,
      ...(changes.scheduledAt && { scheduledAt: changes.scheduledAt }),
      ...(changes.error && { error: truncate(changes.error) }),
    })
    .where(and(eq(emails.id, emailId), eq(emails.leaseToken, leaseToken)));
}

/** Counts a delivery attempt for a claimed email and returns the new total. */
export async function recordAttempt(
  emailId: string,
  leaseToken: string,
): Promise<number> {
  await db
    .update(emails)
    .set({ attempts: sql`${emails.attempts} + 1` })
    .where(and(eq(emails.id, emailId), eq(emails.leaseToken, leaseToken)));
  const row = await db.query.emails.findFirst({
    columns: { attempts: true },
    where: eq(emails.id, emailId),
  });
  return row?.attempts ?? 0;
}

/**
 * Matches on the lease token regardless of status, so a slow worker that finishes after the
 * lease sweeper marked the email failed still records the real outcome.
 */
export async function markSent(
  emailId: string,
  leaseToken: string,
  result: { messageId: string; previewUrl: string | null },
): Promise<void> {
  await db
    .update(emails)
    .set({
      status: "sent",
      messageId: result.messageId,
      previewUrl: result.previewUrl,
      sentAt: new Date(),
      error: null,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(and(eq(emails.id, emailId), eq(emails.leaseToken, leaseToken)));
}

export async function markFailed(
  emailId: string,
  leaseToken: string,
  error: string,
): Promise<void> {
  await db
    .update(emails)
    .set({
      status: "failed",
      error: truncate(error),
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(and(eq(emails.id, emailId), eq(emails.leaseToken, leaseToken)));
}

export async function findEmailForSend(emailId: string) {
  const [row] = await db
    .select({
      id: emails.id,
      campaignId: emails.campaignId,
      recipient: emails.recipient,
      sender: emails.sender,
      userId: emails.userId,
      subject: campaigns.subject,
      body: campaigns.body,
    })
    .from(emails)
    .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
    .where(eq(emails.id, emailId))
    .limit(1);
  return row;
}

/**
 * Emails stuck in `sending` past their lease belonged to a worker that died mid-send.
 * SMTP has no idempotency key, so we cannot tell whether they went out: mark them failed
 * (at-most-once) rather than risk a duplicate. The lease token is kept so a late worker
 * can still record success via `markSent`.
 */
export async function expireLeases(now: Date = new Date()): Promise<string[]> {
  const expiredLease = and(eq(emails.status, "sending"), lt(emails.leaseExpiresAt, now));
  const rows = await db.select({ id: emails.id }).from(emails).where(expiredLease);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  // Re-check the condition in the UPDATE: a worker may have finished since the SELECT.
  await db
    .update(emails)
    .set({ status: "failed", error: LEASE_EXPIRED_ERROR })
    .where(and(inArray(emails.id, ids), expiredLease));
  return ids;
}

/** Keyset page of `scheduled` emails, optionally only those due before `dueBefore`. */
export async function scheduledEmailsAfter(
  cursorId: string,
  limit: number,
  dueBefore?: Date,
) {
  return db
    .select({ id: emails.id, scheduledAt: emails.scheduledAt })
    .from(emails)
    .where(
      and(
        eq(emails.status, "scheduled"),
        gt(emails.id, cursorId),
        dueBefore ? lte(emails.scheduledAt, dueBefore) : undefined,
      ),
    )
    .orderBy(asc(emails.id))
    .limit(limit);
}

export async function setStarred(userId: string, emailId: string, starred: boolean): Promise<boolean> {
  const [result] = await db
    .update(emails)
    .set({ starred })
    .where(and(eq(emails.id, emailId), eq(emails.userId, userId)));
  return result.affectedRows === 1;
}

export async function setArchived(userId: string, emailId: string, archived: boolean): Promise<boolean> {
  const [result] = await db
    .update(emails)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(emails.id, emailId), eq(emails.userId, userId)));
  return result.affectedRows === 1;
}

export async function deleteEmailRow(userId: string, emailId: string): Promise<boolean> {
  const [result] = await db
    .delete(emails)
    .where(and(eq(emails.id, emailId), eq(emails.userId, userId)));
  return result.affectedRows === 1;
}
