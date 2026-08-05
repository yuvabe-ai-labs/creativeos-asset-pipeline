import { describe, it, expect } from "vitest";
import { nudge, rotateAboutCentre } from "./geometry";

const BASE = { x: 0.2, y: 0.2, w: 0.3, h: 0.3, rotation: 0 };

/** Where the box's centre actually lands, in px — the thing rotation must not move. */
function centreOf(
  geo: { x: number; y: number; w: number; h: number; rotation?: number },
  cw: number,
  ch: number,
) {
  const rad = ((geo.rotation ?? 0) * Math.PI) / 180;
  const halfW = (geo.w * cw) / 2;
  const halfH = (geo.h * ch) / 2;
  return {
    x: geo.x * cw + halfW * Math.cos(rad) - halfH * Math.sin(rad),
    y: geo.y * ch + halfW * Math.sin(rad) + halfH * Math.cos(rad),
  };
}

describe("rotateAboutCentre", () => {
  it("keeps the centre fixed at every angle", () => {
    const before = centreOf(BASE, 1000, 1000);
    for (const angle of [-180, -90, -37, 0, 15, 45, 90, 180]) {
      const after = rotateAboutCentre(BASE, angle, 1000, 1000);
      const moved = centreOf(after, 1000, 1000);
      expect(moved.x).toBeCloseTo(before.x, 6);
      expect(moved.y).toBeCloseTo(before.y, 6);
      expect(after.rotation).toBe(angle);
    }
  });

  it("keeps a wide, short layer on the artboard — the rule that used to vanish", () => {
    // A line at the default cascade position: rotating this about its top-left corner swept
    // it off the left edge, which is what "the line disappeared" was.
    const line = { x: 0.1, y: 0.1, w: 0.4, h: 0.06, rotation: 0 };
    const turned = rotateAboutCentre(line, 180, 1000, 1000);
    const centre = centreOf(turned, 1000, 1000);
    expect(centre.x).toBeCloseTo(300, 6); // (0.1 + 0.4/2) * 1000
    expect(centre.y).toBeCloseTo(130, 6); // (0.1 + 0.06/2) * 1000
    expect(turned.x).toBeGreaterThanOrEqual(0);
  });

  it("is a no-op on position when the angle is unchanged", () => {
    const same = rotateAboutCentre(BASE, 0, 1000, 1000);
    expect(same.x).toBeCloseTo(BASE.x, 9);
    expect(same.y).toBeCloseTo(BASE.y, 9);
  });

  it("round-trips back to the original position", () => {
    const there = rotateAboutCentre(BASE, 73, 1000, 1000);
    const back = rotateAboutCentre(there, 0, 1000, 1000);
    expect(back.x).toBeCloseTo(BASE.x, 9);
    expect(back.y).toBeCloseTo(BASE.y, 9);
  });

  it("handles a non-square container, where the two axes scale differently", () => {
    const before = centreOf(BASE, 1080, 1920);
    const after = rotateAboutCentre(BASE, 45, 1080, 1920);
    const moved = centreOf(after, 1080, 1920);
    expect(moved.x).toBeCloseTo(before.x, 6);
    expect(moved.y).toBeCloseTo(before.y, 6);
  });

  it("leaves position alone rather than writing NaN before the stage is measured", () => {
    const result = rotateAboutCentre(BASE, 45, 0, 0);
    expect(result.x).toBe(BASE.x);
    expect(result.y).toBe(BASE.y);
    expect(result.rotation).toBe(45);
  });
});

describe("nudge", () => {
  it("moves 1 normalized-equivalent px in the given direction by default", () => {
    const result = nudge(BASE, "right", 1000, 1000);
    expect(result.x).toBeCloseTo(BASE.x + 0.001, 5);
  });
  it("moves 10px when big=true (shift-arrow)", () => {
    const result = nudge(BASE, "down", 1000, 1000, true);
    expect(result.y).toBeCloseTo(BASE.y + 0.01, 5);
  });
  it("up and left are negative deltas", () => {
    expect(nudge(BASE, "up", 1000, 1000).y).toBeLessThan(BASE.y);
    expect(nudge(BASE, "left", 1000, 1000).x).toBeLessThan(BASE.x);
  });
  it("does not change w/h/rotation", () => {
    const result = nudge(BASE, "right", 1000, 1000);
    expect(result.w).toBe(BASE.w);
    expect(result.h).toBe(BASE.h);
    expect(result.rotation).toBe(BASE.rotation);
  });
});
