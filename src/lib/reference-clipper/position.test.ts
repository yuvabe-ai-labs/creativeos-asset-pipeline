import { describe, it, expect } from "vitest";
import { computeStaggeredPosition } from "./position";

describe("computeStaggeredPosition", () => {
  it("places the first node at the base origin", () => {
    expect(computeStaggeredPosition(0)).toEqual({ x: 40, y: 40 });
  });

  it("steps down by a fixed amount per existing node", () => {
    expect(computeStaggeredPosition(3)).toEqual({ x: 40, y: 220 });
  });

  it("increases monotonically in y as the count grows", () => {
    const a = computeStaggeredPosition(1).y;
    const b = computeStaggeredPosition(2).y;
    expect(b).toBeGreaterThan(a);
  });
});
