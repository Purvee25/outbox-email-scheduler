import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatBadgeTime, tomorrowAt } from "../src/lib/format";

describe("formatBadgeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows a weekday for times within the coming week", () => {
    expect(formatBadgeTime(new Date("2026-10-02T09:15:12").toISOString())).toMatch(/^Fri\b.*9:15:12/);
  });

  it("shows the date for times further away", () => {
    expect(formatBadgeTime(new Date("2026-11-20T09:15:12").toISOString())).toMatch(/Nov 20/);
  });
});

describe("tomorrowAt", () => {
  it("returns tomorrow at the requested local hour", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T20:00:00"));
    expect(tomorrowAt(15)).toBe("2026-10-01T15:00");
    vi.useRealTimers();
  });
});
