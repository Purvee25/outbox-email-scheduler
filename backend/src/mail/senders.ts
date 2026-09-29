import { env } from "../config/env.js";

export interface SenderAccount {
  address: string;
  password: string;
}

/** Stand-in senders for the "log" transport so rate limiting still has multiple senders. */
const LOG_MODE_SENDERS = [
  "sender-1@scheduler.local",
  "sender-2@scheduler.local",
  "sender-3@scheduler.local",
];

function parseSender(entry: string): SenderAccount {
  const separator = entry.indexOf(":");
  if (separator <= 0 || separator === entry.length - 1) {
    throw new Error(
      "ETHEREAL_SENDERS entries must look like user@ethereal.email:password",
    );
  }
  return {
    address: entry.slice(0, separator),
    password: entry.slice(separator + 1),
  };
}

function loadSenders(): SenderAccount[] {
  if (env.ETHEREAL_SENDERS.length > 0)
    return env.ETHEREAL_SENDERS.map(parseSender);
  if (env.MAIL_TRANSPORT === "log")
    return LOG_MODE_SENDERS.map((address) => ({ address, password: "" }));
  throw new Error("ETHEREAL_SENDERS is required when MAIL_TRANSPORT=ethereal");
}

export const senders: readonly SenderAccount[] = loadSenders();
export const senderAddresses: readonly string[] = senders.map(
  (sender) => sender.address,
);
