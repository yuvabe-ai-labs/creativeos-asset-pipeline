import { describe, expect, it } from "vitest";
import {
  addIstDays,
  formatIstDate,
  formatIstTime,
  formatIstWhen,
  formatUtcBeside,
  istDate,
  istInstant,
  istTime,
  parseIstTime,
  relativeIstDay,
  todayIst,
  tomorrowMidnightIst,
} from "../ist";

describe("parseIstTime", () => {
  it.each([
    ["8", "08:00"],
    ["8:00", "08:00"],
    ["08:00", "08:00"],
    ["0800", "08:00"],
    ["800", "08:00"],
    ["8 pm", "20:00"],
    ["8PM", "20:00"],
    ["20:00", "20:00"],
    ["8.30", "08:30"],
    ["12 am", "00:00"],
    ["12 pm", "12:00"],
    ["  23:59 ", "23:59"],
    ["0", "00:00"],
  ])("reads %j as %s", (typed, hm) => {
    expect(parseIstTime(typed)).toBe(hm);
  });

  it.each(["", "abc", "24:00", "8:60", "13 pm", "0 am", "8:5", "123456", "-1"])("refuses %j", (typed) => {
    expect(parseIstTime(typed)).toBeNull();
  });
});

describe("IST date and time to an instant and back", () => {
  it("is 5 h 30 min ahead of UTC", () => {
    expect(istInstant("2026-11-24", "08:00")?.toISOString()).toBe("2026-11-24T02:30:00.000Z");
    expect(istInstant("2026-11-25", "00:00")?.toISOString()).toBe("2026-11-24T18:30:00.000Z");
  });

  it("refuses a date or time that does not exist", () => {
    expect(istInstant("2026-02-30", "08:00")).toBeNull();
    expect(istInstant("2026-13-01", "08:00")).toBeNull();
    expect(istInstant("24 Nov", "08:00")).toBeNull();
    expect(istInstant("2026-11-24", "25:00")).toBeNull();
  });

  it("round-trips every minute-aligned instant", () => {
    for (const iso of ["2026-11-24T02:30:00Z", "2026-11-24T18:29:00Z", "2026-11-24T18:30:00Z", "2026-12-31T23:59:00Z", "2027-02-28T20:00:00Z"]) {
      const at = new Date(iso);
      expect(istInstant(istDate(at), istTime(at))?.getTime()).toBe(at.getTime());
    }
  });

  it("round-trips a typed date and time", () => {
    const at = istInstant("2026-12-03", parseIstTime("8 pm")!)!;
    expect(istDate(at)).toBe("2026-12-03");
    expect(istTime(at)).toBe("20:00");
  });
});

describe("display", () => {
  const at = new Date("2026-11-24T02:30:00Z");
  it("shows IST", () => {
    expect(formatIstDate(at)).toBe("24 Nov 2026");
    expect(formatIstDate(at, false)).toBe("24 Nov");
    expect(formatIstTime(at)).toBe("08:00 IST");
    expect(formatIstWhen(at)).toBe("24 Nov 2026, 08:00 IST");
  });

  it("shows UTC, naming the UTC day when it differs from the IST day", () => {
    expect(formatUtcBeside(at)).toBe("02:30 UTC");
    const midnight = new Date("2026-11-24T18:30:00Z"); // 25 Nov 00:00 IST
    expect(formatIstWhen(midnight)).toBe("25 Nov 2026, 00:00 IST");
    expect(formatUtcBeside(midnight)).toBe("18:30 UTC on 24 Nov");
  });
});

describe("today and tomorrow in IST", () => {
  it("today follows the IST calendar", () => {
    expect(todayIst(new Date("2026-11-24T18:29:00Z"))).toBe("2026-11-24");
    expect(todayIst(new Date("2026-11-24T18:30:00Z"))).toBe("2026-11-25");
  });

  it("adds days across month and year ends", () => {
    expect(addIstDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addIstDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addIstDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("tomorrow 00:00 IST is the next IST midnight", () => {
    expect(tomorrowMidnightIst(new Date("2026-11-24T10:00:00Z")).toISOString()).toBe("2026-11-24T18:30:00.000Z");
    // 00:30 IST on the 25th: tomorrow is the 26th.
    expect(tomorrowMidnightIst(new Date("2026-11-24T19:00:00Z")).toISOString()).toBe("2026-11-25T18:30:00.000Z");
    expect(formatIstWhen(tomorrowMidnightIst(new Date("2026-11-24T10:00:00Z")))).toBe("25 Nov 2026, 00:00 IST");
  });

  it("names the day relative to now in IST", () => {
    const now = new Date("2026-11-24T17:00:00Z"); // 22:30 IST on the 24th
    expect(relativeIstDay(new Date("2026-11-24T18:00:00Z"), now)).toBe("today");
    expect(relativeIstDay(new Date("2026-11-24T18:30:00Z"), now)).toBe("tomorrow");
    expect(relativeIstDay(new Date("2026-11-28T06:00:00Z"), now)).toBe("in 4 days");
    expect(relativeIstDay(new Date("2026-11-23T06:00:00Z"), now)).toBe("yesterday");
    expect(relativeIstDay(new Date("2026-11-20T06:00:00Z"), now)).toBe("4 days ago");
  });
});
