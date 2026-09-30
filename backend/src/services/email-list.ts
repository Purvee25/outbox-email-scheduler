import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import {
  TAB_STATUSES,
  type ListEmailsQuery,
  type ListEmailsResponse,
} from "@scheduler/shared";
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
      sortField: scheduledTab ? "scheduledAt" : "updatedAt",
      sortOrder: scheduledTab ? "asc" : "desc",
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  const where = and(
    eq(emails.userId, userId),
    inArray(emails.status, [...statuses]),
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
        sender: emails.sender,
        status: emails.status,
        scheduledAt: emails.scheduledAt,
        sentAt: emails.sentAt,
        previewUrl: emails.previewUrl,
        error: emails.error,
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
    items: rows.map((row) => ({
      ...row,
      scheduledAt: row.scheduledAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: totals?.total ?? 0,
  };
}
