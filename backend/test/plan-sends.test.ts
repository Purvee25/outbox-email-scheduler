import { describe, expect, it } from "vitest";
import {
  HOUR_MS,
  normalizeRecipients,
  planSends,
} from "../src/scheduling/plan-sends.js";

const SENDERS = ["a@x.test", "b@x.test"];
const recipients = (n: number) =>
  Array.from({ length: n }, (_, i) => `r${i}@x.test`);
const atHour = (hour: number, minutes = 0) =>
  new Date(hour * HOUR_MS + minutes * 60_000);

describe("planSends", () => {
  it("spaces sends by the delay and rotates senders", () => {
    const plan = planSends(recipients(3), {
      startAt: atHour(100),
      delayMs: 2000,
      hourlyLimit: 10,
      senders: SENDERS,
    });

    expect(
      plan.map((p) => p.scheduledAt.getTime() - atHour(100).getTime()),
    ).toEqual([0, 2000, 4000]);
    expect(plan.map((p) => p.sender)).toEqual([
      "a@x.test",
      "b@x.test",
      "a@x.test",
    ]);
  });

  it("delays sends beyond the hourly limit until an hour after the send `limit` places back", () => {
    const plan = planSends(recipients(5), {
      startAt: atHour(100),
      delayMs: 1000,
      hourlyLimit: 2,
      senders: SENDERS,
    });

    expect(plan.map((p) => p.scheduledAt)).toEqual([
      atHour(100),
      new Date(atHour(100).getTime() + 1000),
      atHour(101),
      new Date(atHour(101).getTime() + 1000),
      atHour(102),
    ]);
  });

  it("uses a rolling window, so crossing :00 does not reset the limit", () => {
    // A clock-hour window would allow 100:59, 101:00 and 101:01 (3 sends in 2 minutes).
    const plan = planSends(recipients(3), {
      startAt: atHour(100, 59),
      delayMs: 60_000,
      hourlyLimit: 2,
      senders: SENDERS,
    });

    expect(plan.map((p) => p.scheduledAt)).toEqual([
      atHour(100, 59),
      atHour(101, 0),
      atHour(101, 59),
    ]);
  });

  it("never puts more than the limit in any 60-minute span", () => {
    const limit = 7;
    const plan = planSends(recipients(100), {
      startAt: atHour(100, 23),
      delayMs: 90_000,
      hourlyLimit: limit,
      senders: SENDERS,
    });
    const times = plan.map((p) => p.scheduledAt.getTime());

    for (let i = limit; i < times.length; i++) {
      expect(times[i]! - times[i - limit]!).toBeGreaterThanOrEqual(HOUR_MS);
    }
  });

  it("keeps send times non-decreasing for large campaigns", () => {
    const plan = planSends(recipients(1000), {
      startAt: atHour(100),
      delayMs: 0,
      hourlyLimit: 200,
      senders: SENDERS,
    });
    const times = plan.map((p) => p.scheduledAt.getTime());

    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times.map((t) => Math.floor(t / HOUR_MS))).size).toBe(5);
  });

  it("rejects an empty sender list", () => {
    expect(() =>
      planSends(recipients(1), {
        startAt: atHour(1),
        delayMs: 0,
        hourlyLimit: 1,
        senders: [],
      }),
    ).toThrow();
  });

  it("returns an empty array for zero recipients", () => {
    expect(
      planSends([], {
        startAt: atHour(0),
        delayMs: 1000,
        hourlyLimit: 10,
        senders: SENDERS,
      }),
    ).toEqual([]);
  });

  it("spaces every send >= 1 hour apart when hourlyLimit is 1", () => {
    const result = planSends(recipients(3), {
      startAt: atHour(0),
      delayMs: 0,
      hourlyLimit: 1,
      senders: SENDERS,
    });
    for (let i = 1; i < result.length; i++) {
      const gap =
        result[i]!.scheduledAt.getTime() - result[i - 1]!.scheduledAt.getTime();
      expect(gap).toBeGreaterThanOrEqual(HOUR_MS);
    }
  });
});

describe("normalizeRecipients", () => {
  it("trims, lowercases and removes duplicates in first-seen order", () => {
    expect(normalizeRecipients([" B@x.test", "a@x.test", "b@x.test "])).toEqual(
      ["b@x.test", "a@x.test"],
    );
  });
});
