import { Client } from "@elastic/elasticsearch";
import type { EmailStatus } from "@scheduler/shared";
import { env } from "../config/env.js";

export const es = new Client({ node: env.ELASTICSEARCH_URL });
export const EMAIL_INDEX = env.ELASTICSEARCH_INDEX;

/** Everything the dashboard renders, so search results need no MySQL round trip. */
export interface EmailDocument {
  id: string;
  userId: string;
  campaignId: string;
  recipient: string;
  sender: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  updatedAt: string;
  previewUrl: string | null;
  error: string | null;
}

let indexReady: Promise<void> | null = null;

/**
 * Creates the index with explicit mappings if it does not exist yet. Memoized on success and
 * called before every write, so Elasticsearch never auto-creates it with guessed mappings.
 */
export function ensureEmailIndex(): Promise<void> {
  indexReady ??= createIndexIfMissing().catch((error: unknown) => {
    indexReady = null; // retry on the next call
    throw error;
  });
  return indexReady;
}

async function createIndexIfMissing(): Promise<void> {
  if (await es.indices.exists({ index: EMAIL_INDEX })) return;
  try {
    await es.indices.create({
      index: EMAIL_INDEX,
      mappings: {
        dynamic: "strict",
        properties: {
          id: { type: "keyword" },
          userId: { type: "keyword" },
          campaignId: { type: "keyword" },
          // search_as_you_type adds n-gram subfields, so "ada@ex" matches while typing.
          recipient: { type: "search_as_you_type" },
          subject: { type: "search_as_you_type" },
          body: { type: "text" },
          sender: { type: "keyword" },
          status: { type: "keyword" },
          scheduledAt: { type: "date" },
          sentAt: { type: "date" },
          updatedAt: { type: "date" },
          previewUrl: { type: "keyword", index: false },
          error: { type: "text", index: false },
        },
      },
    });
  } catch (error) {
    // Another process created it between our check and create.
    if (
      (error as { meta?: { body?: { error?: { type?: string } } } }).meta?.body
        ?.error?.type !== "resource_already_exists_exception"
    ) {
      throw error;
    }
  }
}
