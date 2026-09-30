import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { HOUR_MS } from "../src/scheduling/plan-sends.js";
import {
  acquireSendTurn,
  reserveSendSlot,
} from "../src/scheduling/send-slots.js";

const redis = new Redis(process.env.REDIS_URL!);
const SENDER = "sender@x.test";
const WINDOW = 500_000;
const NOW = WINDOW * HOUR_MS + 1000;
let prefix: string;

beforeEach(() => {
  prefix = `test:${randomUUID()}`;
});

afterAll(async () => {
  // SCAN instead of KEYS to avoid O(N) full-keyspace block on large Redis instances.
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      "test:*",
      "COUNT",
      100,
    );
    if (keys.length > 0) await redis.del(...keys);
    cursor = next;
  } while (cursor !== "0");
  await redis.quit();
});

describe("reserveSendSlot", () => {
  it("spaces consecutive reservations by the minimum gap", async () => {
    const limits = { minDelayMs: 2000, maxPerHour: 100 };
    const first = await reserveSendSlot(redis, SENDER, limits, NOW, prefix);
    const second = await reserveSendSlot(redis, SENDER, limits, NOW, prefix);

    expect(first.sendAt).toBe(NOW);
    expect(second.sendAt).toBe(NOW + 2000);
  });

  it("delays a reservation past the hourly limit to one hour after the oldest counted send", async () => {
    const limits = { minDelayMs: 0, maxPerHour: 2 };
    const results = [];
    for (let i = 0; i < 3; i++)
      results.push(await reserveSendSlot(redis, SENDER, limits, NOW, prefix));

    expect(results.map((r) => r.hourlyLimitHit)).toEqual([false, false, true]);
    expect(results[2]!.sendAt).toBe(NOW + HOUR_MS);
  });

  it("does not reset the limit at the top of the hour", async () => {
    const limits = { minDelayMs: 0, maxPerHour: 2 };
    const justBeforeHour = (WINDOW + 1) * HOUR_MS - 1000;
    await reserveSendSlot(redis, SENDER, limits, justBeforeHour, prefix);
    await reserveSendSlot(redis, SENDER, limits, justBeforeHour, prefix);

    // A fixed clock-hour window would allow this one 1 s later, at :00.
    const third = await reserveSendSlot(
      redis,
      SENDER,
      limits,
      justBeforeHour + 1000,
      prefix,
    );

    expect(third.hourlyLimitHit).toBe(true);
    expect(third.sendAt).toBe(justBeforeHour + HOUR_MS);
  });

  it("keeps limits per sender", async () => {
    const limits = { minDelayMs: 5000, maxPerHour: 1 };
    const a = await reserveSendSlot(redis, "a@x.test", limits, NOW, prefix);
    const b = await reserveSendSlot(redis, "b@x.test", limits, NOW, prefix);

    expect([a.sendAt, b.sendAt]).toEqual([NOW, NOW]);
  });

  it("enforces hourlyLimit=1: every slot is >= 1 hour after the previous", async () => {
    const limits = { minDelayMs: 0, maxPerHour: 1 };
    const first = await reserveSendSlot(redis, SENDER, limits, NOW, prefix);
    const second = await reserveSendSlot(redis, SENDER, limits, NOW, prefix);
    const third = await reserveSendSlot(redis, SENDER, limits, NOW, prefix);

    expect(second.hourlyLimitHit).toBe(true);
    expect(third.hourlyLimitHit).toBe(true);
    expect(second.sendAt - first.sendAt).toBeGreaterThanOrEqual(HOUR_MS);
    expect(third.sendAt - second.sendAt).toBeGreaterThanOrEqual(HOUR_MS);
  });

  it("never puts more than the limit in any 60-minute span under concurrent reservations", async () => {
    const limit = 10;
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        reserveSendSlot(
          redis,
          SENDER,
          { minDelayMs: 0, maxPerHour: limit },
          NOW,
          prefix,
        ),
      ),
    );

    const times = results.map((r) => r.sendAt).sort((a, b) => a - b);
    for (let i = limit; i < times.length; i++) {
      expect(times[i]! - times[i - limit]!).toBeGreaterThanOrEqual(HOUR_MS);
    }
    // Flagged once per spill into a later hour (the jump), not on every queued email behind it.
    expect(results.filter((r) => r.hourlyLimitHit)).toHaveLength(4);
  });

  it("gives every concurrent reservation a distinct, gap-spaced time", async () => {
    const limits = { minDelayMs: 1000, maxPerHour: 1000 };
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        reserveSendSlot(redis, SENDER, limits, NOW, prefix),
      ),
    );

    const times = results.map((r) => r.sendAt).sort((a, b) => a - b);
    expect(times).toEqual(Array.from({ length: 20 }, (_, i) => NOW + i * 1000));
  });
});

describe("acquireSendTurn", () => {
  it("allows the first send and makes the next one wait out the remaining gap", async () => {
    expect(await acquireSendTurn(redis, SENDER, 2000, NOW, prefix)).toBe(0);
    // Second job woke 73 ms early relative to the gap because the first one ran late.
    expect(await acquireSendTurn(redis, SENDER, 2000, NOW + 1927, prefix)).toBe(
      73,
    );
    expect(await acquireSendTurn(redis, SENDER, 2000, NOW + 2000, prefix)).toBe(
      0,
    );
  });

  it("lets only one of many simultaneous sends through", async () => {
    const waits = await Promise.all(
      Array.from({ length: 10 }, () =>
        acquireSendTurn(redis, SENDER, 2000, NOW, prefix),
      ),
    );

    expect(waits.filter((w) => w === 0)).toHaveLength(1);
  });

  it("does not block when the gap is zero", async () => {
    expect(await acquireSendTurn(redis, SENDER, 0, NOW, prefix)).toBe(0);
    expect(await acquireSendTurn(redis, SENDER, 0, NOW, prefix)).toBe(0);
  });
});
