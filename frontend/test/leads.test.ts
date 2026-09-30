import { describe, expect, it } from "vitest";
import { MAX_LEADS_FILE_BYTES, parseLeadsFile } from "../src/lib/leads";

const csv = (content: string) => new File([content], "leads.csv", { type: "text/csv" });

describe("parseLeadsFile", () => {
  it("finds addresses in any column and ignores headers", async () => {
    const result = await parseLeadsFile(csv("name,email\nAda,ada@example.com\nLin,lin@example.com\n"));

    expect(result.emails).toEqual(["ada@example.com", "lin@example.com"]);
  });

  it("removes duplicates and counts invalid addresses", async () => {
    const result = await parseLeadsFile(csv("a@example.com\nA@example.com\nnot@valid\nb@example.com\n"));

    expect(result.emails).toEqual(["a@example.com", "b@example.com"]);
    expect(result.duplicates).toBe(1);
    expect(result.invalid).toBe(1);
  });

  it("rejects files over the size limit", async () => {
    const big = new File([new Uint8Array(MAX_LEADS_FILE_BYTES + 1)], "big.csv");

    await expect(parseLeadsFile(big)).rejects.toThrow(/2 MB/);
  });
});
