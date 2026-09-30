export const HOUR_MS = 60 * 60 * 1000;

export interface SendPlanOptions {
  startAt: Date;
  delayMs: number;
  /** Max emails this campaign sends in any rolling 60-minute window. */
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
 * Sends are spaced `delayMs` apart starting at `startAt`. The hourly limit is a rolling
 * window, the same rule the runtime per-sender limiter uses: a send is never earlier than one
 * hour after the send `hourlyLimit` places before it, so no 60-minute span holds more than
 * `hourlyLimit` sends. Order is preserved because send times only ever increase.
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

  recipients.forEach((recipient, index) => {
    if (index > 0) sendAt += delayMs;

    const windowStart = plan[index - hourlyLimit]?.scheduledAt.getTime();
    if (windowStart !== undefined && sendAt < windowStart + HOUR_MS) {
      sendAt = windowStart + HOUR_MS;
    }

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
