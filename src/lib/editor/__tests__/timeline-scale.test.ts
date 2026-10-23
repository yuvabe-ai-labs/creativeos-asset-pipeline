import { describe, expect, it } from "vitest";
import { laneBox, pxPerSecond, TIMELINE_WINDOW_SECONDS } from "../timeline-scale";

describe("timeline scale", () => {
  it("shows a fixed 20 s window", () => {
    expect(TIMELINE_WINDOW_SECONDS).toBe(20);
    expect(pxPerSecond(1280)).toBe(64);
    expect(pxPerSecond(0)).toBe(16);
  });

  it("places every lane on exact offsets, with a visible minimum width", () => {
    expect(laneBox(2, 0.05, 64)).toEqual({ left: 128, width: 6 });
    expect(laneBox(2, 1, 64)).toEqual({ left: 128, width: 64 });
  });
});
