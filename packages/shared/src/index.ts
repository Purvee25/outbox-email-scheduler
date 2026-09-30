import { z } from "zod";

export const EMAIL_STATUSES = [
  "scheduled",
  "sending",
  "sent",
  "failed",
] as const;
export const emailStatusSchema = z.enum(EMAIL_STATUSES);
export type EmailStatus = z.infer<typeof emailStatusSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  avatarUrl: z.url().nullable(),
});
export type User = z.infer<typeof userSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
  slackConnected: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const MAX_RECIPIENTS_PER_CAMPAIGN = 5000;
export const MAX_DELAY_BETWEEN_EMAILS_MS = 60 * 60 * 1000;

export const MAX_ATTACHMENTS_PER_CAMPAIGN = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** Sent to every recipient, so keep the per-message total modest. */
export const MAX_ATTACHMENT_TOTAL_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
] as const;

export const attachmentSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const createCampaignSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required")
    .max(998, "Subject is too long"),
  body: z
    .string()
    .trim()
    .min(1, "Body is required")
    .max(100_000, "Body is too long"),
  recipients: z
    .array(z.email("Invalid email address"))
    .min(1, "Add at least one recipient")
    .max(
      MAX_RECIPIENTS_PER_CAMPAIGN,
      `At most ${MAX_RECIPIENTS_PER_CAMPAIGN} recipients per campaign`,
    ),
  attachmentIds: z
    .array(z.uuid())
    .max(MAX_ATTACHMENTS_PER_CAMPAIGN)
    .default([]),
  startAt: z.iso.datetime({ offset: true, error: "Choose a valid start time" }),
  delayMs: z
    .number({ error: "Enter a delay in seconds" })
    .int("Delay must be a whole number of seconds")
    .min(0, "Delay can't be negative")
    .max(MAX_DELAY_BETWEEN_EMAILS_MS, "Delay can be at most 1 hour"),
  hourlyLimit: z
    .number({ error: "Enter an hourly limit" })
    .int("Hourly limit must be a whole number")
    .min(1, "Hourly limit must be at least 1"),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const createCampaignResponseSchema = z.object({
  campaignId: z.uuid(),
  scheduledCount: z.number().int(),
  duplicatesRemoved: z.number().int(),
  firstSendAt: z.iso.datetime(),
  lastSendAt: z.iso.datetime(),
  effectiveHourlyLimit: z.number().int(),
});
export type CreateCampaignResponse = z.infer<
  typeof createCampaignResponseSchema
>;

/**
 * Dashboard tabs: "scheduled" shows scheduled + sending, "sent" shows sent + failed (both
 * unarchived). "archived" shows every status, so an archived email that is still scheduled
 * stays visible instead of vanishing while it waits to send.
 */
export const EMAIL_TABS = ["scheduled", "sent", "archived"] as const;
export const emailTabSchema = z.enum(EMAIL_TABS);
export type EmailTab = z.infer<typeof emailTabSchema>;

export const TAB_STATUSES: Record<EmailTab, readonly EmailStatus[]> = {
  scheduled: ["scheduled", "sending"],
  sent: ["sent", "failed"],
  archived: ["scheduled", "sending", "sent", "failed"],
};

export const MAX_SEARCH_LENGTH = 200;

export const listEmailsQuerySchema = z
  .object({
    tab: emailTabSchema,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    /** Free-text search (Elasticsearch). Empty means "list everything" (MySQL). */
    q: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
    /** Narrows the tab to one of its statuses. */
    status: emailStatusSchema.optional(),
  })
  .refine(
    (query) => !query.status || TAB_STATUSES[query.tab].includes(query.status),
    {
      message: "status does not belong to this tab",
      path: ["status"],
    },
  );
export type ListEmailsQuery = z.infer<typeof listEmailsQuerySchema>;

const PREVIEW_LENGTH = 140;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/** One-line snippet of a body for list rows: tags dropped, whitespace collapsed, truncated. */
export function bodyPreview(body: string): string {
  const flat = body
    .replace(/<\/(p|li|h[1-3]|blockquote)>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (entity) => HTML_ENTITIES[entity] ?? entity,
    )
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > PREVIEW_LENGTH
    ? `${flat.slice(0, PREVIEW_LENGTH).trimEnd()}…`
    : flat;
}

export const emailListItemSchema = z.object({
  id: z.uuid(),
  recipient: z.email(),
  subject: z.string(),
  preview: z.string(),
  starred: z.boolean(),
  sender: z.string(),
  status: emailStatusSchema,
  archived: z.boolean(),
  scheduledAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  previewUrl: z.url().nullable(),
  error: z.string().nullable(),
});
export type EmailListItem = z.infer<typeof emailListItemSchema>;

export const emailDetailSchema = emailListItemSchema.extend({
  body: z.string(),
  attachments: z.array(attachmentSchema),
});
export type EmailDetail = z.infer<typeof emailDetailSchema>;

export const listEmailsResponseSchema = z.object({
  items: z.array(emailListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type ListEmailsResponse = z.infer<typeof listEmailsResponseSchema>;

export const emailStatsSchema = z.object({
  scheduled: z.number().int(),
  sending: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
});
export type EmailStats = z.infer<typeof emailStatsSchema>;

export const updateEmailSchema = z
  .object({ starred: z.boolean().optional(), archived: z.boolean().optional() })
  .refine(
    (value) => value.starred !== undefined || value.archived !== undefined,
    {
      message: "Provide starred or archived",
    },
  );
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
