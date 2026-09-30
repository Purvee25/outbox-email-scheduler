import { MAX_RECIPIENTS_PER_CAMPAIGN } from "@scheduler/shared";
import Papa from "papaparse";
import { z } from "zod";

export const MAX_LEADS_FILE_BYTES = 2 * 1024 * 1024;
const emailSchema = z.email();

export interface ParsedLeads {
  emails: string[];
  invalid: number;
  duplicates: number;
}

/**
 * Extracts email addresses from a CSV or plain-text file. Any cell containing "@" is treated
 * as an address, so files with or without headers and extra columns (name, company…) work.
 * The server re-validates and de-duplicates; this is for the preview count.
 */
export function parseLeadsFile(file: File): Promise<ParsedLeads> {
  if (file.size > MAX_LEADS_FILE_BYTES) {
    return Promise.reject(new Error("File is larger than 2 MB"));
  }
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      error: (error) => reject(error),
      complete: ({ data }) => {
        const seen = new Set<string>();
        let invalid = 0;
        let duplicates = 0;
        for (const cell of data.flat()) {
          const value = cell.trim().toLowerCase();
          if (!value.includes("@")) continue;
          if (!emailSchema.safeParse(value).success) invalid += 1;
          else if (seen.has(value)) duplicates += 1;
          else seen.add(value);
        }
        if (seen.size > MAX_RECIPIENTS_PER_CAMPAIGN) {
          reject(new Error(`Found ${seen.size} emails; the limit is ${MAX_RECIPIENTS_PER_CAMPAIGN} per campaign`));
          return;
        }
        resolve({ emails: [...seen], invalid, duplicates });
      },
    });
  });
}
