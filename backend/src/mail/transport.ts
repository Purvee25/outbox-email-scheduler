import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { senders } from "./senders.js";

const ETHEREAL_HOST = "smtp.ethereal.email";
const ETHEREAL_PORT = 587;
// Kept well below the worker lock duration so a hung SMTP call cannot outlive the job lock.
const SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 20_000;
export const MESSAGE_ID_DOMAIN = "scheduler.local";

export interface OutgoingEmail {
  emailId: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface SendResult {
  messageId: string;
  previewUrl: string | null;
}

const transporters = new Map<string, Transporter>();

function transporterFor(address: string): Transporter {
  const cached = transporters.get(address);
  if (cached) return cached;

  const account = senders.find((sender) => sender.address === address);
  if (!account) throw new Error(`Unknown sender ${address}`);

  const transporter =
    env.MAIL_TRANSPORT === "log"
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({
          host: ETHEREAL_HOST,
          port: ETHEREAL_PORT,
          auth: { user: account.address, pass: account.password },
          connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
          greetingTimeout: SMTP_CONNECTION_TIMEOUT_MS,
          socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
        });
  transporters.set(address, transporter);
  return transporter;
}

/**
 * Sends one email. The Message-ID is derived from the email id so every attempt for the
 * same row carries the same identifier (useful for tracing; SMTP itself has no idempotency).
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const info = await transporterFor(email.from).sendMail({
    messageId: `<${email.emailId}@${MESSAGE_ID_DOMAIN}>`,
    from: email.from,
    to: email.to,
    subject: email.subject,
    text: email.text,
  });
  const previewUrl =
    env.MAIL_TRANSPORT === "ethereal"
      ? nodemailer.getTestMessageUrl(info)
      : false;
  return { messageId: info.messageId, previewUrl: previewUrl || null };
}

/** True for SMTP 5xx replies, which will fail the same way on retry. */
export function isPermanentSmtpError(error: unknown): boolean {
  const code = (error as { responseCode?: unknown } | null)?.responseCode;
  return typeof code === "number" && code >= 500;
}
