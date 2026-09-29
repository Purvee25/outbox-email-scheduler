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
  const keys = await redis.keys("test:*");
  if (keys.length > 0) await redis.del(...keys);
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

  it("moves reservations past the hourly limit to the next window and flags it", async () => {
    const limits = { minDelayMs: 0, maxPerHour: 2 };
    const results = [];
    for (let i = 0; i < 3; i++)
      results.push(await reserveSendSlot(redis, SENDER, limits, NOW, prefix));

    expect(results.map((r) => r.hourlyLimitHit)).toEqual([false, false, true]);
    expect(results[2]!.sendAt).toBe((WINDOW + 1) * HOUR_MS);
    expect(results[2]!.window).toBe(WINDOW + 1);
  });

  it("keeps limits per sender", async () => {
    const limits = { minDelayMs: 5000, maxPerHour: 1 };
    const a = await reserveSendSlot(redis, "a@x.test", limits, NOW, prefix);
    const b = await reserveSendSlot(redis, "b@x.test", limits, NOW, prefix);

    expect([a.sendAt, b.sendAt]).toEqual([NOW, NOW]);
  });

  it("never over-allocates a window under concurrent reservations", async () => {
    const limits = { minDelayMs: 0, maxPerHour: 10 };
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        reserveSendSlot(redis, SENDER, limits, NOW, prefix),
      ),
    );

    const perWindow = new Map<number, number>();
    for (const r of results)
      perWindow.set(r.window, (perWindow.get(r.window) ?? 0) + 1);
    expect([...perWindow.values()]).toEqual([10, 10, 10, 10, 10]);
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
    expect(await acquireSendTurn(redis, SENDER, 2000, NOW + 1927, prefix)).toBe(73);
    expect(await acquireSendTurn(redis, SENDER, 2000, NOW + 2000, prefix)).toBe(0);
  });

  it("lets only one of many simultaneous sends through", async () => {
    const waits = await Promise.all(
      Array.from({ length: 10 }, () => acquireSendTurn(redis, SENDER, 2000, NOW, prefix)),
    );

    expect(waits.filter((w) => w === 0)).toHaveLength(1);
  });

  it("does not block when the gap is zero", async () => {
    expect(await acquireSendTurn(redis, SENDER, 0, NOW, prefix)).toBe(0);
    expect(await acquireSendTurn(redis, SENDER, 0, NOW, prefix)).toBe(0);
  });
});
