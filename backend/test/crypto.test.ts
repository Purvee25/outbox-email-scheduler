import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/lib/crypto.js";

const SECRET = "https://hooks.slack.com/services/T000/B000/XXXX";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips and never stores the plaintext", () => {
    const stored = encryptSecret(SECRET);

    expect(stored).not.toContain("hooks.slack.com");
    expect(decryptSecret(stored)).toBe(SECRET);
  });

  it("uses a fresh IV for every encryption", () => {
    expect(encryptSecret(SECRET)).not.toBe(encryptSecret(SECRET));
  });

  it("rejects tampered ciphertext", () => {
    const stored = encryptSecret(SECRET);
    const bytes = Buffer.from(stored.slice(3), "base64");
    bytes[bytes.length - 1]! ^= 0xff;

    expect(() => decryptSecret(`v1:${bytes.toString("base64")}`)).toThrow();
  });

  it("rejects unknown formats", () => {
    expect(() => decryptSecret("plain-text")).toThrow(
      "Unsupported secret format",
    );
  });
});
