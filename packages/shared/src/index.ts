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
