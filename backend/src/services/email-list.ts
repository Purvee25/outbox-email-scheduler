import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type {
  EmailStatus,
  EmailTab,
  ListEmailsQuery,
  ListEmailsResponse,
} from "@scheduler/shared";
import { db } from "../db/client.js";
import { campaigns, emails } from "../db/schema.js";

const TAB_STATUSES: Record<EmailTab, EmailStatus[]> = {
  scheduled: ["scheduled", "sending"],
  sent: ["sent", "failed"],
};

/** Lists the user's emails for a dashboard tab. Always scoped to `userId`. */
export async function listEmails(
  userId: string,
  query: ListEmailsQuery,
): Promise<ListEmailsResponse> {
  const where = and(
    eq(emails.userId, userId),
    inArray(emails.status, TAB_STATUSES[query.tab]),
  );
  const order =
    query.tab === "scheduled"
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
