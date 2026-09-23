import { describe, it, expect } from "vitest";
import { deriveShotDuration } from "../derive-shot-duration";

describe("deriveShotDuration", () => {
  it("sums the beats", () => {
    expect(deriveShotDuration({
      visual_script: { shots: [{ duration_seconds: 4 }, { duration_seconds: 5 }] },
    })).toBe(9);
  });

  // D277 — the script states the length; a model that cannot take it says so itself. Clamping here
  // silently handed a 14s scene to a 10s request.
  it("returns the script's own length, however long", () => {
    expect(deriveShotDuration({ visual_script: { shots: [{ duration_seconds: 14 }] } })).toBe(14);
    expect(deriveShotDuration({ visual_script: { shots: [{ duration_seconds: 2 }] } })).toBe(2);
  });

  it("sums a multi-row script", () => {
    expect(
      deriveShotDuration({
        visual_script: { shots: [{ duration_seconds: 6 }, { duration_seconds: 4 }] },
      }),
    ).toBe(10);
  });

  // Not 3 — an absent script is not a 3-second shot, and the caller should keep its own default.
  it("returns null when there is nothing to derive from", () => {
    expect(deriveShotDuration(null)).toBeNull();
    expect(deriveShotDuration({ visual_script: { shots: [] } })).toBeNull();
  });
});
