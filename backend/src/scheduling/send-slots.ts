import type { Redis } from "ioredis";
import { HOUR_MS } from "./plan-sends.js";

/**
 * Atomically reserves the next send time for one sender, enforcing both limits:
 *  - minimum gap: consecutive reservations for a sender are at least `gapMs` apart;
 *  - hourly cap as a rolling window: a reservation is never earlier than one hour after the
 *    reservation `limit` places before it, so no 60-minute span (not just no clock hour) holds
 *    more than `limit` sends. This removes the 2x burst a fixed window allows around :00.
 *
 * Reservations are handed out first-come first-served per sender and only ever increase, so
 * the log is sorted by construction and a backlog drains in order with one reservation per job.
 *
 * KEYS[1] = next-free time, KEYS[2] = list of the sender's last `limit` reservation times.
 * Both share the sender's hash tag, so the script touches one slot and is Redis Cluster-safe.
 * ARGV = now, gapMs, limit, hourMs. Returns { sendAt, limitHit (0|1) }.
 */
const RESERVE_SLOT_SCRIPT = `
local now = tonumber(ARGV[1])
local gap = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local hour = tonumber(ARGV[4])

local sendAt = math.max(now, tonumber(redis.call('GET', KEYS[1]) or '0'))
local limitHit = 0
local count = redis.call('LLEN', KEYS[2])
if count >= limit then
  local windowStart = tonumber(redis.call('LINDEX', KEYS[2], count - limit))
  if sendAt < windowStart + hour then
    sendAt = windowStart + hour
    limitHit = 1
  end
end

redis.call('RPUSH', KEYS[2], sendAt)
redis.call('LTRIM', KEYS[2], -limit, -1)
redis.call('PEXPIREAT', KEYS[2], sendAt + hour)

local nextFree = sendAt + gap
redis.call('SET', KEYS[1], nextFree, 'PX', (nextFree - now) + hour)
return { sendAt, limitHit }
`;

export interface SlotLimits {
  minDelayMs: number;
  maxPerHour: number;
}

export interface SlotReservation {
  sendAt: number;
  /** True when the sender's hourly limit was reached and the slot was pushed later. */
  hourlyLimitHit: boolean;
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

/** `{sender}` is a Redis Cluster hash tag: all of a sender's keys land in the same slot. */
export function slotKeys(sender: string, prefix = "rl") {
  return {
    nextFree: `${prefix}:{${sender}}:next`,
    sendLog: `${prefix}:{${sender}}:log`,
    lastSend: `${prefix}:{${sender}}:last`,
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
  const [sendAt, limitHit] = (await redis.eval(
    RESERVE_SLOT_SCRIPT,
    2,
    keys.nextFree,
    keys.sendLog,
    now,
    limits.minDelayMs,
    limits.maxPerHour,
    HOUR_MS,
  )) as [number, number];
  return { sendAt, hourlyLimitHit: limitHit === 1 };
}
