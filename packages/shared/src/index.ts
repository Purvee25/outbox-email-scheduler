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

export const createCampaignSchema = z.object({
  subject: z.string().trim().min(1).max(998),
  body: z.string().trim().min(1).max(100_000),
  recipients: z.array(z.email()).min(1).max(MAX_RECIPIENTS_PER_CAMPAIGN),
  startAt: z.iso.datetime({ offset: true }),
  delayMs: z.number().int().min(0).max(MAX_DELAY_BETWEEN_EMAILS_MS),
  hourlyLimit: z.number().int().min(1),
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

/** Dashboard tabs: "scheduled" shows scheduled + sending, "sent" shows sent + failed. */
export const EMAIL_TABS = ["scheduled", "sent"] as const;
export const emailTabSchema = z.enum(EMAIL_TABS);
export type EmailTab = z.infer<typeof emailTabSchema>;

export const listEmailsQuerySchema = z.object({
  tab: emailTabSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListEmailsQuery = z.infer<typeof listEmailsQuerySchema>;

export const emailListItemSchema = z.object({
  id: z.uuid(),
  recipient: z.email(),
  subject: z.string(),
  sender: z.string(),
  status: emailStatusSchema,
  scheduledAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  previewUrl: z.url().nullable(),
  error: z.string().nullable(),
});
export type EmailListItem = z.infer<typeof emailListItemSchema>;

export const listEmailsResponseSchema = z.object({
  items: z.array(emailListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type ListEmailsResponse = z.infer<typeof listEmailsResponseSchema>;
