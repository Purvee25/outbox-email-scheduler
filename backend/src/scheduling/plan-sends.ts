export const HOUR_MS = 60 * 60 * 1000;

export interface SendPlanOptions {
  startAt: Date;
  delayMs: number;
  /** Max emails this campaign sends in one clock-hour window. */
  hourlyLimit: number;
  senders: readonly string[];
}

export interface PlannedSend {
  recipient: string;
  sender: string;
  scheduledAt: Date;
}

/**
 * Assigns each recipient a sender (round-robin) and a send time.
 *
 * Sends are spaced `delayMs` apart starting at `startAt`. When a clock-hour window has used
 * the campaign's `hourlyLimit`, the next send moves to the start of the following window.
 * Windows are aligned to clock hours so they match the runtime per-sender limiter; order is
 * preserved because send times only ever increase.
 */
export function planSends(
  recipients: readonly string[],
  options: SendPlanOptions,
): PlannedSend[] {
  const { startAt, delayMs, hourlyLimit, senders } = options;
  if (senders.length === 0) throw new Error("At least one sender is required");
  if (hourlyLimit < 1) throw new Error("hourlyLimit must be at least 1");

  const plan: PlannedSend[] = [];
  let sendAt = startAt.getTime();
  let window = Math.floor(sendAt / HOUR_MS);
  let sentInWindow = 0;

  recipients.forEach((recipient, index) => {
    if (index > 0) sendAt += delayMs;

    const sendWindow = Math.floor(sendAt / HOUR_MS);
    if (sendWindow !== window) {
      window = sendWindow;
      sentInWindow = 0;
    }
    if (sentInWindow >= hourlyLimit) {
      window += 1;
      sendAt = window * HOUR_MS;
      sentInWindow = 0;
    }

    sentInWindow += 1;
    plan.push({
      recipient,
      sender: senders[index % senders.length] as string,
      scheduledAt: new Date(sendAt),
    });
  });

  return plan;
}

/** Lowercases, trims and de-duplicates recipients, keeping first-seen order. */
export function normalizeRecipients(recipients: readonly string[]): string[] {
  return [
    ...new Set(recipients.map((recipient) => recipient.trim().toLowerCase())),
  ];
}
