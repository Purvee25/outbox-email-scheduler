import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
} from "@scheduler/shared";
import {
  deleteUnclaimedAttachment,
  findOwnedAttachment,
  insertAttachment,
} from "../db/attachment-repo.js";
import { HttpError } from "../lib/http-error.js";
import { parseOrThrow } from "../lib/validate.js";
import { currentUserId } from "../middleware/auth.js";

const MAX_FILENAME_LENGTH = 255;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
}).single("file");

/** Runs multer and reports its errors as ordinary HTTP errors. */
function receiveFile(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new HttpError(413, "File is larger than 5 MB"));
    }
    next(new HttpError(400, "Couldn't read the uploaded file"));
  });
}

export const attachmentsRouter = Router();

attachmentsRouter.post("/", receiveFile, async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, "No file uploaded");
  if (!(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(file.mimetype)) {
    throw new HttpError(415, "This file type isn't allowed (images, PDF, text or CSV only)");
  }
  const attachment = await insertAttachment({
    id: randomUUID(),
    userId: currentUserId(req),
    filename: file.originalname.slice(0, MAX_FILENAME_LENGTH),
    contentType: file.mimetype,
    data: file.buffer,
  });
  res.status(201).json(attachment);
});

attachmentsRouter.get("/:id", async (req, res) => {
  const id = parseOrThrow(z.uuid(), req.params.id);
  const file = await findOwnedAttachment(currentUserId(req), id);
  if (!file) throw new HttpError(404, "Attachment not found");
  // Always a download, never rendered inline, so an uploaded file can't run in our origin.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type(file.contentType);
  res.attachment(file.filename);
  res.send(file.data);
});

attachmentsRouter.delete("/:id", async (req, res) => {
  const id = parseOrThrow(z.uuid(), req.params.id);
  const removed = await deleteUnclaimedAttachment(currentUserId(req), id);
  if (!removed) throw new HttpError(404, "Attachment not found or already in use");
  res.status(204).end();
});
