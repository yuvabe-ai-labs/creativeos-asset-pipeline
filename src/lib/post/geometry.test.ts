import { describe, it, expect } from "vitest";
import { nudge } from "./geometry";

const BASE = { x: 0.2, y: 0.2, w: 0.3, h: 0.3, rotation: 0 };

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
