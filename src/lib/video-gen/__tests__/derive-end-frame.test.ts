import { describe, it, expect } from "vitest";
import { endFrameNodePosition } from "../derive-end-frame";

describe("endFrameNodePosition", () => {
  it("places the derived node below-left of the video node", () => {
    expect(endFrameNodePosition({ x: 500, y: 300 })).toEqual({ x: 140, y: 540 });
  });

  // A video node near the canvas origin must not push its derived node off-canvas.
  it("does not produce negative coordinates near the canvas origin", () => {
    const pos = endFrameNodePosition({ x: 0, y: 0 });
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
  });

  it("always places the node below its video node", () => {
    for (const y of [0, 100, 2000]) {
      expect(endFrameNodePosition({ x: 800, y }).y).toBeGreaterThan(y);
    }
  });
});
