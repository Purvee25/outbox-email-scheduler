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

  it("moves sends beyond the hourly limit to the next clock hour", () => {
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

  it("counts windows by clock hour, not from the start time", () => {
    // Starts 1 minute before the hour: the first window has room for 2, then a fresh hour begins.
    const plan = planSends(recipients(3), {
      startAt: atHour(100, 59),
      delayMs: 60_000,
      hourlyLimit: 2,
      senders: SENDERS,
    });

    expect(plan.map((p) => p.scheduledAt)).toEqual([
      atHour(100, 59),
      atHour(101, 0),
      atHour(101, 1),
    ]);
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
});

describe("normalizeRecipients", () => {
  it("trims, lowercases and removes duplicates in first-seen order", () => {
    expect(normalizeRecipients([" B@x.test", "a@x.test", "b@x.test "])).toEqual(
      ["b@x.test", "a@x.test"],
    );
  });
});
