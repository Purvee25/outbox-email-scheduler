import type { Redis } from "ioredis";
import { HOUR_MS } from "./plan-sends.js";

/**
 * Atomically reserves the next send time for one sender, enforcing both limits:
 *  - minimum gap: consecutive reservations for a sender are at least `gapMs` apart;
 *  - hourly cap: at most `limit` reservations per clock-hour window. A full window is skipped
 *    and the reservation lands at the start of the next window with free capacity.
 *
 * Reservations are handed out first-come first-served per sender, so a backlog drains in
 * order with one reservation per job instead of every job polling for a free slot.
 *
 * Keys: KEYS[1] = next-free-time key for the sender.
 * Window counters are derived in-script from ARGV[5] (single-node Redis; not cluster-safe).
 * Returns { sendAt, skippedWindow (0|1), window }.
 */
const RESERVE_SLOT_SCRIPT = `
local now = tonumber(ARGV[1])
local gap = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local hour = tonumber(ARGV[4])
local prefix = ARGV[5]

local sendAt = math.max(now, tonumber(redis.call('GET', KEYS[1]) or '0'))
local window = math.floor(sendAt / hour)
local skipped = 0
while tonumber(redis.call('GET', prefix .. window) or '0') >= limit do
  window = window + 1
  sendAt = math.max(sendAt, window * hour)
  skipped = 1
end

local countKey = prefix .. window
redis.call('INCR', countKey)
redis.call('PEXPIREAT', countKey, (window + 2) * hour)

local nextFree = sendAt + gap
redis.call('SET', KEYS[1], nextFree, 'PX', (nextFree - now) + hour)
return { sendAt, skipped, window }
`;

export interface SlotLimits {
  minDelayMs: number;
  maxPerHour: number;
}

export interface SlotReservation {
  sendAt: number;
  /** True when the sender's hourly limit was reached and the slot moved to a later window. */
  hourlyLimitHit: boolean;
  window: number;
}

/**
 * Guards the actual send moment. Reserved slots are `gapMs` apart, but jobs wake with a few
 * milliseconds of queue latency each, so two sends could land closer than the gap. This
 * compare-and-set on the sender's last real send time returns 0 (go) or the ms still to wait.
 * KEYS[1] = last-send key; ARGV = now, gapMs, ttlMs.
 */
const ACQUIRE_SEND_TURN_SCRIPT = `
local now = tonumber(ARGV[1])
local gap = tonumber(ARGV[2])
local last = tonumber(redis.call('GET', KEYS[1]) or '-1')
if last >= 0 and now - last < gap then
  return gap - (now - last)
end
redis.call('SET', KEYS[1], now, 'PX', ARGV[3])
return 0
`;
const LAST_SEND_TTL_EXTRA_MS = 60_000;

export function slotKeys(sender: string, prefix = "rl") {
  return {
    nextFree: `${prefix}:next:${sender}`,
    lastSend: `${prefix}:last:${sender}`,
    windowCountPrefix: `${prefix}:hour:${sender}:`,
  };
}

/** Returns 0 when the sender may send now (and records the send), else ms to wait. */
export async function acquireSendTurn(
  redis: Redis,
  sender: string,
  minDelayMs: number,
  now: number = Date.now(),
  keyPrefix?: string,
): Promise<number> {
  return (await redis.eval(
    ACQUIRE_SEND_TURN_SCRIPT,
    1,
    slotKeys(sender, keyPrefix).lastSend,
    now,
    minDelayMs,
    minDelayMs + LAST_SEND_TTL_EXTRA_MS,
  )) as number;
}

export async function reserveSendSlot(
  redis: Redis,
  sender: string,
  limits: SlotLimits,
  now: number = Date.now(),
  keyPrefix?: string,
): Promise<SlotReservation> {
  const keys = slotKeys(sender, keyPrefix);
  const [sendAt, skipped, window] = (await redis.eval(
    RESERVE_SLOT_SCRIPT,
    1,
    keys.nextFree,
    now,
    limits.minDelayMs,
    limits.maxPerHour,
    HOUR_MS,
    keys.windowCountPrefix,
  )) as [number, number, number];
  return { sendAt, hourlyLimitHit: skipped === 1, window };
}
