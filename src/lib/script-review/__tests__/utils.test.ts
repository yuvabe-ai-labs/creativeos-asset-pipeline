// src/lib/script-review/__tests__/utils.test.ts
import { describe, it, expect } from "vitest";
import { formatDayTime, formatShortDay, upsertComment } from "../utils";
import { comment } from "./fixtures";

describe("dates", () => {
  it("reads the day in India, so the server's HTML and the browser agree", () => {
    expect(formatShortDay("2026-10-10T09:00:00.000Z")).toBe("10 Oct");
    // 20:00 UTC is 01:30 the next morning in India.
    expect(formatShortDay("2026-10-10T20:00:00.000Z")).toBe("11 Oct");
  });

  it("adds the time for activity lines", () => {
    expect(formatDayTime("2026-10-10T08:35:00.000Z")).toMatch(/^10 Oct,? 14:05$/);
  });
});

describe("upsertComment", () => {
  it("adds a new comment and replaces an edited one", () => {
    const a = comment({ id: "a", body: "one" });
    expect(upsertComment([a], comment({ id: "b" })).map((c) => c.id)).toEqual(["a", "b"]);
    expect(upsertComment([a], comment({ id: "a", body: "two" }))[0].body).toBe("two");
  });
});
