import { describe, it, expect } from "vitest";
import { deriveShotDuration, deriveMultishotDuration } from "../derive-shot-duration";
import type { MultishotCut } from "../multishot-cuts";
import { OMNI_MIN_SECONDS, OMNI_MAX_SECONDS } from "../group-shots";

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

// Arriving at a Video Gen node from a Multishot node used to land on the model spec's flat 8s
// however long the ladder was — the request and the ladder disagreeing is exactly the
// truncated-at-full-price failure the cut budget exists to prevent.
describe("deriveMultishotDuration", () => {
  const cut = (seconds: number, i: number): MultishotCut => ({ id: `c${i}`, text: "", seconds });

  it("sums the ladder — the budget IS the duration to ask for", () => {
    expect(deriveMultishotDuration([cut(2, 1), cut(3, 2), cut(4, 3)])).toBe(9);
  });

  it("clamps to the model's window at both ends", () => {
    expect(deriveMultishotDuration([cut(20, 1)])).toBe(OMNI_MAX_SECONDS);
    expect(deriveMultishotDuration([cut(1, 1)])).toBe(OMNI_MIN_SECONDS);
  });

  // Same reason as the shot path: no cuts is not a 3-second video.
  it("returns null when there is no ladder to read", () => {
    expect(deriveMultishotDuration(null)).toBeNull();
    expect(deriveMultishotDuration(undefined)).toBeNull();
    expect(deriveMultishotDuration([])).toBeNull();
  });
});
