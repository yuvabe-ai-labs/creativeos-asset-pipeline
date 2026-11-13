import { describe, expect, it } from "vitest";
import { clampPanelShare, clampTimelineHeight, DEFAULT_LAYOUT, MAX_PANEL_SHARE, MIN_PANEL_SHARE, MIN_TIMELINE, readLayout } from "../layout";

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
    expect(readLayout(JSON.stringify({ sources: false, timelineHeight: 420 }))).toEqual({ ...DEFAULT_LAYOUT, sources: false, timelineHeight: 420 });
    expect(readLayout(JSON.stringify({ sources: "no", timelineHeight: "tall" }))).toEqual(DEFAULT_LAYOUT);
  });

  it("keeps the side panel's share of the width usable, and reads where it is docked", () => {
    expect(clampPanelShare(0.05)).toBe(MIN_PANEL_SHARE);
    expect(clampPanelShare(0.9)).toBe(MAX_PANEL_SHARE);
    expect(clampPanelShare(0.33333)).toBe(0.333);
    expect(clampPanelShare(Number.NaN)).toBe(DEFAULT_LAYOUT.panelShare);
    expect(readLayout(JSON.stringify({ panelShare: 0.5, panelDock: "left" }))).toEqual({ ...DEFAULT_LAYOUT, panelShare: 0.5, panelDock: "left" });
    expect(readLayout(JSON.stringify({ panelShare: 2, panelDock: "top" }))).toEqual({ ...DEFAULT_LAYOUT, panelShare: MAX_PANEL_SHARE });
  });
});
