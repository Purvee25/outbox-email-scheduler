import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  bodyPreview,
  TAB_STATUSES,
  type EmailDetail,
  type ListEmailsQuery,
  type ListEmailsResponse,
} from "@scheduler/shared";
import { listCampaignAttachments } from "../db/attachment-repo.js";
import { toSafeHtml } from "../lib/html.js";
import { db } from "../db/client.js";
import { campaigns, emails } from "../db/schema.js";
import { searchEmails } from "../search/search-emails.js";

/**
 * Lists the user's emails for a dashboard tab, always scoped to `userId`.
 * Free-text queries go to Elasticsearch; plain listing reads MySQL, which is authoritative
 * and has no indexing lag.
 */
export async function listEmails(
  userId: string,
  query: ListEmailsQuery,
): Promise<ListEmailsResponse> {
  const statuses = query.status ? [query.status] : TAB_STATUSES[query.tab];
  const scheduledTab = query.tab === "scheduled";

  if (query.q) {
    return searchEmails({
      userId,
      text: query.q,
      statuses,
      isArchived: query.tab === "archived",
      sortField: scheduledTab ? "scheduledAt" : "updatedAt",
      sortOrder: scheduledTab ? "asc" : "desc",
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  const where = and(
    eq(emails.userId, userId),
    inArray(emails.status, [...statuses]),
    query.tab === "archived" ? emails.archivedAt : isNull(emails.archivedAt)
  );
  const order = scheduledTab
    ? [asc(emails.scheduledAt)]
    : [desc(emails.updatedAt)];

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: emails.id,
        recipient: emails.recipient,
        subject: campaigns.subject,
        body: campaigns.body,
        sender: emails.sender,
        status: emails.status,
        scheduledAt: emails.scheduledAt,
        sentAt: emails.sentAt,
        previewUrl: emails.previewUrl,
        error: emails.error,
        starred: emails.starred,
        archivedAt: emails.archivedAt,
      })
      .from(emails)
      .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
      .where(where)
      .orderBy(...order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(emails).where(where),
  ]);

  return {
    items: rows.map(({ body, archivedAt, ...row }) => ({
      ...row,
      archived: archivedAt !== null,
      preview: bodyPreview(body),
      scheduledAt: row.scheduledAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: totals?.total ?? 0,
  };
}

/** One email with its body, or null when it doesn't exist or belongs to another user. */
export async function getEmail(
  userId: string,
  emailId: string,
): Promise<EmailDetail | null> {
  const [row] = await db
    .select({
      id: emails.id,
      campaignId: emails.campaignId,
      recipient: emails.recipient,
      subject: campaigns.subject,
      body: campaigns.body,
      sender: emails.sender,
      status: emails.status,
      scheduledAt: emails.scheduledAt,
      sentAt: emails.sentAt,
      previewUrl: emails.previewUrl,
      error: emails.error,
      starred: emails.starred,
      archivedAt: emails.archivedAt,
    })
    .from(emails)
    .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
    .where(and(eq(emails.id, emailId), eq(emails.userId, userId)))
    .limit(1);
  if (!row) return null;
  const { campaignId, archivedAt, ...email } = row;
  return {
    ...email,
    archived: archivedAt !== null,
    attachments: await listCampaignAttachments(campaignId),
    body: toSafeHtml(row.body),
    preview: bodyPreview(row.body),
    scheduledAt: row.scheduledAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  };
}
