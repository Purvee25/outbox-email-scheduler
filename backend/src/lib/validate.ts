import type { z } from "zod";
import { HttpError } from "./http-error.js";

const MAX_REPORTED_ISSUES = 5;

/** Parses untrusted input with a zod schema, turning failures into a 400. */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  const details = parsed.error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
  throw new HttpError(400, `Invalid request — ${details}`);
}
