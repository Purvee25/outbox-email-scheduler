import { Client, type estypes } from "@elastic/elasticsearch";
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
  starred: boolean;
  archived: boolean;
}

let indexReady: Promise<void> | null = null;

/**
 * Ensures the index exists with the current mappings. Memoized on success and called before
 * every write, so Elasticsearch never auto-creates it with guessed mappings.
 */
export function ensureEmailIndex(): Promise<void> {
  indexReady ??= createIndexIfMissing().catch((error: unknown) => {
    indexReady = null; // retry on the next call
    throw error;
  });
  return indexReady;
}

/** Field mappings. Adding fields here upgrades existing indexes on the next `ensureEmailIndex`. */
const EMAIL_PROPERTIES = {
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
  starred: { type: "boolean" },
  archived: { type: "boolean" },
} satisfies Record<string, estypes.MappingProperty>;

/**
 * Creates the index if missing; otherwise applies the current mappings to it. Put-mapping
 * only ever adds fields (and is a no-op for unchanged ones), so an index created by an older
 * version of the app picks up new fields instead of rejecting documents under strict mapping.
 */
async function createIndexIfMissing(): Promise<void> {
  if (await es.indices.exists({ index: EMAIL_INDEX })) {
    await es.indices.putMapping({ index: EMAIL_INDEX, properties: EMAIL_PROPERTIES });
    return;
  }
  try {
    await es.indices.create({
      index: EMAIL_INDEX,
      mappings: { dynamic: "strict", properties: EMAIL_PROPERTIES },
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
