import { describe, it, expect } from "vitest";
import { endsAtFromDay, lastDayOf, todayIst, formatDay, isDay } from "../dates";

describe("billing dates (India time)", () => {
  it("ends a chosen day at midnight India time", () => {
    expect(endsAtFromDay("2026-12-03")).toBe("2026-12-03T18:30:00.000Z");
    expect(endsAtFromDay("2026-12-31")).toBe("2026-12-31T18:30:00.000Z");
  });

  it("turns an end back into the last day it works", () => {
    expect(lastDayOf("2026-12-03T18:30:00.000Z")).toBe("2026-12-03");
    expect(lastDayOf(endsAtFromDay("2027-01-01"))).toBe("2027-01-01");
  });

  it("knows today in India", () => {
    expect(todayIst(new Date("2026-12-02T19:00:00Z"))).toBe("2026-12-03");
    expect(todayIst(new Date("2026-12-02T18:00:00Z"))).toBe("2026-12-02");
  });

  it("writes a day plainly", () => {
    expect(formatDay("2026-12-03")).toBe("3 Dec 2026");
  });

  it("accepts only real days", () => {
    expect(isDay("2026-12-03")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("3 Dec")).toBe(false);
  });
});
