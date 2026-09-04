import { describe, it, expect } from "vitest";
import { deriveShotDuration } from "../derive-shot-duration";

describe("deriveShotDuration", () => {
  it("sums the beats", () => {
    expect(deriveShotDuration({
      visual_script: { shots: [{ duration_seconds: 4 }, { duration_seconds: 5 }] },
    })).toBe(9);
  });

  // An over-cap shot is kept whole by grouping and clamped here, at the request.
  it("clamps to the model's range at both ends", () => {
    expect(deriveShotDuration({ visual_script: { shots: [{ duration_seconds: 14 }] } })).toBe(10);
    expect(deriveShotDuration({ visual_script: { shots: [{ duration_seconds: 2 }] } })).toBe(3);
  });

  // Not 3 — an absent script is not a 3-second shot, and the caller should keep its own default.
  it("returns null when there is nothing to derive from", () => {
    expect(deriveShotDuration(null)).toBeNull();
    expect(deriveShotDuration({ visual_script: { shots: [] } })).toBeNull();
  });
});
