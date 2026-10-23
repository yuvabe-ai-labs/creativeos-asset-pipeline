import { describe, expect, it } from "vitest";
import { clampTimelineHeight, DEFAULT_LAYOUT, MIN_TIMELINE, readLayout } from "../layout";

describe("editor layout (D403)", () => {
  it("keeps the timeline between its minimum and what leaves room for the stage", () => {
    expect(clampTimelineHeight(50, 900)).toBe(MIN_TIMELINE);
    expect(clampTimelineHeight(2000, 900)).toBe(620);
    expect(clampTimelineHeight(400, 900)).toBe(400);
    expect(clampTimelineHeight(400, 300)).toBe(MIN_TIMELINE); // a tiny window: the minimum wins
  });

  it("reads a stored layout, falling back on anything it doesn't recognise", () => {
    expect(readLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(readLayout("not json")).toEqual(DEFAULT_LAYOUT);
    expect(readLayout(JSON.stringify({ sources: false, timelineHeight: 420 }))).toEqual({ sources: false, inspector: true, timelineHeight: 420 });
    expect(readLayout(JSON.stringify({ sources: "no", timelineHeight: "tall" }))).toEqual(DEFAULT_LAYOUT);
  });
});
