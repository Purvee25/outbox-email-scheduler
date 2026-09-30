import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Attachment } from "@scheduler/shared";
import { db } from "./client.js";
import { attachments } from "./schema.js";

const metadataColumns = {
  id: attachments.id,
  filename: attachments.filename,
  contentType: attachments.contentType,
  size: attachments.size,
};

export async function insertAttachment(input: {
  id: string;
  userId: string;
  filename: string;
  contentType: string;
  data: Buffer;
}): Promise<Attachment> {
  await db.insert(attachments).values({ ...input, size: input.data.length });
  return {
    id: input.id,
    filename: input.filename,
    contentType: input.contentType,
    size: input.data.length,
  };
}

/** The file, only if it belongs to `userId`. */
export async function findOwnedAttachment(userId: string, id: string) {
  const [row] = await db
    .select({ ...metadataColumns, data: attachments.data })
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
    .limit(1);
  return row;
}

/** Deletes an upload that no campaign has claimed yet. Returns whether one was removed. */
export async function deleteUnclaimedAttachment(
  userId: string,
  id: string,
): Promise<boolean> {
  const [result] = await db
    .delete(attachments)
    .where(
      and(
        eq(attachments.id, id),
        eq(attachments.userId, userId),
        isNull(attachments.campaignId),
      ),
    );
  return result.affectedRows > 0;
}

export async function listCampaignAttachments(
  campaignId: string,
): Promise<Attachment[]> {
  return db
    .select(metadataColumns)
    .from(attachments)
    .where(eq(attachments.campaignId, campaignId));
}

/** Files with their content, for sending. */
export async function loadCampaignFiles(campaignId: string) {
  return db
    .select({
      filename: attachments.filename,
      contentType: attachments.contentType,
      data: attachments.data,
    })
    .from(attachments)
    .where(eq(attachments.campaignId, campaignId));
}

/** Sizes of the caller's unclaimed uploads among `ids`, used to validate before linking. */
export async function unclaimedSizes(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: attachments.id, size: attachments.size })
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, userId),
        isNull(attachments.campaignId),
        inArray(attachments.id, ids),
      ),
    );
}

/** Removes uploads that were never attached to a campaign (e.g. compose abandoned). */
export async function deleteStaleUnclaimedAttachments(
  olderThan: Date,
): Promise<number> {
  const [result] = await db
    .delete(attachments)
    .where(and(isNull(attachments.campaignId), lt(attachments.createdAt, olderThan)));
  return result.affectedRows;
}
