import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./relative-time";

const now = new Date("2026-06-15T12:00:00Z");

describe("formatRelativeTime", () => {
  it("returns an em dash for null", () => {
    expect(formatRelativeTime(null, now)).toBe("—");
  });

  it("returns an em dash for an unparseable string", () => {
    expect(formatRelativeTime("not-a-date", now)).toBe("—");
  });

  it("says 'just now' under a minute", () => {
    expect(formatRelativeTime("2026-06-15T11:59:30Z", now)).toBe("just now");
  });

  it("formats minutes", () => {
    expect(formatRelativeTime("2026-06-15T11:45:00Z", now)).toBe("15m ago");
  });

  it("formats hours", () => {
    expect(formatRelativeTime("2026-06-15T10:00:00Z", now)).toBe("2h ago");
  });

  it("says 'yesterday' between 24 and 48 hours", () => {
    expect(formatRelativeTime("2026-06-14T10:00:00Z", now)).toBe("yesterday");
  });

  it("formats days", () => {
    expect(formatRelativeTime("2026-06-12T12:00:00Z", now)).toBe("3d ago");
  });

  it("formats weeks", () => {
    expect(formatRelativeTime("2026-06-01T12:00:00Z", now)).toBe("2w ago");
  });

  it("falls back to a short date past ~5 weeks", () => {
    expect(formatRelativeTime("2026-04-01T12:00:00Z", now)).toBe("Apr 1");
  });
});
