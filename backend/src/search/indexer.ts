import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { campaigns, emails } from "../db/schema.js";
import { EMAIL_INDEX, ensureEmailIndex, es, type EmailDocument } from "./client.js";

/** Reads the current state of the given emails from MySQL, the source of truth. */
async function loadDocuments(
  emailIds: readonly string[],
): Promise<EmailDocument[]> {
  const rows = await db
    .select({
      id: emails.id,
      userId: emails.userId,
      campaignId: emails.campaignId,
      recipient: emails.recipient,
      sender: emails.sender,
      subject: campaigns.subject,
      body: campaigns.body,
      status: emails.status,
      scheduledAt: emails.scheduledAt,
      sentAt: emails.sentAt,
      updatedAt: emails.updatedAt,
      previewUrl: emails.previewUrl,
      error: emails.error,
    })
    .from(emails)
    .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
    .where(inArray(emails.id, [...emailIds]));

  return rows.map((row) => ({
    ...row,
    scheduledAt: row.scheduledAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Upserts the given emails into Elasticsearch from their current MySQL rows, and removes
 * documents whose rows no longer exist. Reading current state (instead of trusting event
 * payloads) makes this idempotent and immune to out-of-order index jobs.
 */
export async function indexEmails(
  emailIds: readonly string[],
  options: { refresh?: boolean } = {},
): Promise<{ indexed: number; deleted: number }> {
  if (emailIds.length === 0) return { indexed: 0, deleted: 0 };

  await ensureEmailIndex();
  const documents = await loadDocuments(emailIds);
  const found = new Set(documents.map((doc) => doc.id));
  const missing = emailIds.filter((id) => !found.has(id));

  const response = await es.bulk({
    refresh: options.refresh ? "wait_for" : false,
    operations: [
      ...documents.flatMap((doc) => [
        { index: { _index: EMAIL_INDEX, _id: doc.id } },
        doc,
      ]),
      ...missing.map((id) => ({ delete: { _index: EMAIL_INDEX, _id: id } })),
    ],
  });

  // Deleting a document that was never indexed returns 404, which is fine.
  const failures = response.items.filter((item) => {
    const result = item.index ?? item.delete;
    return result?.error && !(item.delete && result.status === 404);
  });
  if (failures.length > 0) {
    const first = failures[0]?.index?.error ?? failures[0]?.delete?.error;
    throw new Error(
      `Elasticsearch rejected ${failures.length} documents: ${first?.reason ?? "unknown error"}`,
    );
  }
  return { indexed: documents.length, deleted: missing.length };
}
