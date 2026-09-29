import { sql } from "drizzle-orm";
import {
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { EMAIL_STATUSES } from "@scheduler/shared";

const id = () => varchar("id", { length: 36 }).primaryKey();
const createdAt = () =>
  timestamp("created_at", { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`);

export const users = mysqlTable("users", {
  id: id(),
  googleId: varchar("google_id", { length: 64 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  avatarUrl: varchar("avatar_url", { length: 1024 }),
  createdAt: createdAt(),
});

export const slackConnections = mysqlTable("slack_connections", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // AES-256-GCM ciphertexts; the webhook URL is itself a bearer credential.
  webhookUrlEnc: text("webhook_url_enc").notNull(),
  // Kept only so Disconnect can revoke the app installation via auth.revoke.
  accessTokenEnc: text("access_token_enc").notNull(),
  channel: varchar("channel", { length: 255 }),
  teamName: varchar("team_name", { length: 255 }),
  connectedAt: createdAt(),
});

export const campaigns = mysqlTable(
  "campaigns",
  {
    id: id(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 998 }).notNull(),
    body: text("body").notNull(),
    startAt: datetime("start_at", { fsp: 3 }).notNull(),
    delayMs: int("delay_ms").notNull(),
    hourlyLimit: int("hourly_limit").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("campaigns_user_idx").on(table.userId)],
);

export const emails = mysqlTable(
  "emails",
  {
    id: id(),
    campaignId: varchar("campaign_id", { length: 36 })
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipient: varchar("recipient", { length: 320 }).notNull(),
    sender: varchar("sender", { length: 320 }).notNull(),
    scheduledAt: datetime("scheduled_at", { fsp: 3 }).notNull(),
    status: mysqlEnum("status", EMAIL_STATUSES).notNull().default("scheduled"),
    attempts: int("attempts").notNull().default(0),
    messageId: varchar("message_id", { length: 255 }),
    previewUrl: varchar("preview_url", { length: 1024 }),
    sentAt: datetime("sent_at", { fsp: 3 }),
    error: text("error"),
    leaseToken: varchar("lease_token", { length: 64 }),
    leaseExpiresAt: datetime("lease_expires_at", { fsp: 3 }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      // Set by Drizzle on every update: MySQL rejects `ON UPDATE CURRENT_TIMESTAMP`
      // without a matching fsp, and drizzle's onUpdateNow() cannot emit one.
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("emails_campaign_recipient_uq").on(
      table.campaignId,
      table.recipient,
    ),
    index("emails_user_status_time_idx").on(
      table.userId,
      table.status,
      table.scheduledAt,
    ),
    index("emails_status_lease_idx").on(table.status, table.leaseExpiresAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type EmailRow = typeof emails.$inferSelect;
