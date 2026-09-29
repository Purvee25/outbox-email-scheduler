import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

const key = Buffer.from(env.ENCRYPTION_KEY, "hex");

/** Encrypts a secret for storage as `v1:<base64(iv | tag | ciphertext)>`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

/** Decrypts a value from `encryptSecret`; throws if it was tampered with or the key is wrong. */
export function decryptSecret(stored: string): string {
  const [version, payload] = stored.split(":");
  if (version !== VERSION || !payload)
    throw new Error("Unsupported secret format");
  const data = Buffer.from(payload, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, data.subarray(0, IV_BYTES));
  decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
}
