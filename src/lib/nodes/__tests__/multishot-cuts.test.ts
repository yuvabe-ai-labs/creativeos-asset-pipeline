import { describe, it, expect } from "vitest";
import {
  MIN_CUT_SECONDS,
  addCut,
  clampTotal,
  cutsFromShots,
  fitToTotal,
  maxSecondsFor,
  newCut,
  removeCut,
  resizeCut,
  shotsFromCuts,
  totalOf,
} from "../multishot-cuts";
import type { MultishotCut } from "../multishot-cuts";
import { OMNI_MAX_SECONDS, OMNI_MIN_SECONDS } from "../group-shots";

const cuts = (...seconds: number[]): MultishotCut[] =>
  seconds.map((s, i) => ({ id: `c${i}`, text: `cut ${i + 1}`, seconds: s }));

const secondsOf = (cs: MultishotCut[]) => cs.map((c) => c.seconds);

describe("cutsFromShots", () => {
  // Unchanged by the Kling-allocation rework — this is the one place cuts are constructed from
  // external data, unrelated to how totalSeconds and totalOf(cuts) relate afterward.
  it("gives every cut a distinct id and reads duration_seconds", () => {
    const result = cutsFromShots([
      { description: "keys", duration_seconds: 2 },
      { description: "cab", duration_seconds: 3 },
    ]);
    expect(secondsOf(result)).toEqual([2, 3]);
    expect(result.map((c) => c.text)).toEqual(["keys", "cab"]);
    expect(result[0].id).not.toBe(result[1].id);
  });

  // shotSeconds' documented fallback — a shot with no usable length is worth 4s for packing.
  it("falls back to the assumed length when a shot has none", () => {
    expect(secondsOf(cutsFromShots([{ description: "x" }]))).toEqual([4]);
  });

  it("floors a sub-1s shot to the minimum (1s)", () => {
    expect(secondsOf(cutsFromShots([{ description: "x", duration_seconds: 0.4 }]))).toEqual([1]);
  });

  it("rounds a fractional shot to an integer", () => {
    expect(secondsOf(cutsFromShots([{ description: "x", duration_seconds: 2.6 }]))).toEqual([3]);
  });
});

describe("shotsFromCuts", () => {
  // Unchanged — the inverse used when a Multishot node is flipped back to a Shot.
  it("round-trips text and seconds back into ReelShots", () => {
    expect(shotsFromCuts(cuts(2, 3))).toEqual([
      { description: "cut 1", duration_seconds: 2 },
      { description: "cut 2", duration_seconds: 3 },
    ]);
  });
});

describe("resizeCut", () => {
  // The Kling-allocation model: `totalSeconds` is the operator's independent Total, now an
  // explicit argument. Growing one cut spends headroom under THAT total, never a neighbour's
  // seconds — neighbours must come back byte-for-byte unchanged.
  it("changes only the targeted cut, leaving neighbours untouched", () => {
    // [2,2,4] allocated=8, total=10, headroom=2 -> cut 0 can grow to 4.
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 4, 10))).toEqual([4, 2, 4]);
  });

  it("cannot be dragged past the point where allocated would exceed the given total", () => {
    // [2,2,4] allocated=8; total=10 -> cut 0's ceiling is 2 + (10-8) = 4. Asking for 9 clamps to 4.
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 9, 10))).toEqual([4, 2, 4]);
    expect(totalOf(resizeCut(cuts(2, 2, 4), 0, 9, 10))).toBe(10);
  });

  // Demonstrates the whole point of decoupling: the ceiling now tracks the OPERATOR'S total, not
  // OMNI_MAX_SECONDS. The same [2,2,4] list allows a much smaller reach when total is 6 — and
  // since [2,2,4] (sum 8) is already OVER a total of 6, the ceiling for cut 0 is actually below
  // its current value (2 + (6-8) = 0, floored to 1), so even a request to GROW it clamps it down.
  it("the ceiling tracks the operator's total, not OMNI_MAX_SECONDS", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 9, 6))).toEqual([1, 2, 4]);
    expect(secondsOf(resizeCut(cuts(2, 2, 2), 0, 9, 6))).toEqual([2, 2, 2]); // exactly balanced already
  });

  it("cannot go below MIN_CUT_SECONDS (1)", () => {
    expect(secondsOf(resizeCut(cuts(3, 2, 3), 0, 0, 10))).toEqual([1, 2, 3]);
  });

  it("lets a single cut grow all the way to the given total, not past it", () => {
    expect(secondsOf(resizeCut(cuts(5), 0, 8, 10))).toEqual([8]);
    expect(secondsOf(resizeCut(cuts(5), 0, 20, 10))).toEqual([10]);
    expect(secondsOf(resizeCut(cuts(5), 0, 20, 7))).toEqual([7]);
  });

  it("resizing the last cut leaves every earlier cut untouched", () => {
    // [2,2,4] allocated=8; total=10 -> cut 2's ceiling is 4 + (10-8) = 6.
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 2, 6, 10))).toEqual([2, 2, 6]);
  });

  it("returns the list unchanged for a negative index", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), -1, 3, 10))).toEqual([2, 2, 4]);
  });

  it("returns the list unchanged for an index one past the end", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 3, 3, 10))).toEqual([2, 2, 4]);
  });

  it("is a no-op when asked for the seconds it already has", () => {
    const original = cuts(2, 2, 4);
    expect(resizeCut(original, 0, 2, 10)).toBe(original);
  });
});

describe("maxSecondsFor", () => {
  // Headroom is shared across the whole list against the given total, not OMNI_MAX_SECONDS: a
  // cut's ceiling is its own current length plus however much room is left under that total.
  it("returns the cut's own seconds plus the list's headroom under the given total", () => {
    // [2,2,4]: allocated=8, headroom under 10 is 2. index 0 -> 2+2=4. index 2 -> 4+2=6.
    expect(maxSecondsFor(cuts(2, 2, 4), 0, 10)).toBe(4);
    expect(maxSecondsFor(cuts(2, 2, 4), 2, 10)).toBe(6);
  });

  it("lets a single cut's ceiling reach the given total", () => {
    expect(maxSecondsFor(cuts(5), 0, 10)).toBe(10);
    expect(maxSecondsFor(cuts(5), 0, 7)).toBe(7);
  });

  it("floors at MIN_CUT_SECONDS when the list is already over the given total", () => {
    // [1,14] allocated=15, total=10 -> index 0's raw headroom is 1+(10-15) = -4, floored at 1.
    expect(maxSecondsFor(cuts(1, 14), 0, 10)).toBe(MIN_CUT_SECONDS);
  });

  it("returns 0 for an out-of-range index", () => {
    expect(maxSecondsFor(cuts(2, 2, 4), -1, 10)).toBe(0);
    expect(maxSecondsFor(cuts(2, 2, 4), 3, 10)).toBe(0);
  });
});

describe("addCut", () => {
  // DEFERRED — unused today, but kept honest against the new model: a new cut is funded by
  // headroom under the operator's TOTAL (now an explicit argument), not OMNI_MAX_SECONDS.
  it("appends a 1s cut when there is headroom under the total, growing allocated", () => {
    const result = addCut(cuts(2, 2, 4), 10);
    expect(secondsOf(result)).toEqual([2, 2, 4, 1]);
    expect(totalOf(result)).toBe(9);
  });

  it("gives the new cut a distinct id and empty text", () => {
    const result = addCut(cuts(4), 10);
    expect(result[1].text).toBe("");
    expect(result[1].id).not.toBe(result[0].id);
  });

  it("refuses when allocated is already at the given total", () => {
    expect(addCut(cuts(10), 10)).toEqual(cuts(10));
  });

  it("succeeds at the boundary — exactly 1s of headroom under the total is enough", () => {
    expect(totalOf(addCut(cuts(9), 10))).toBe(10);
  });
});

describe("removeCut", () => {
  // Unchanged: removing a cut shrinks ALLOCATED (totalOf) by exactly its seconds — the Total is
  // an operator-owned field this function never touches, and there is no `totalSeconds` argument
  // to touch it with.
  it("shrinks allocated and leaves the other cuts alone", () => {
    const result = removeCut(cuts(2, 2, 4), 0);
    expect(secondsOf(result)).toEqual([2, 4]);
    expect(totalOf(result)).toBe(6);
  });

  it("leaves earlier cuts alone when removing the last one", () => {
    expect(secondsOf(removeCut(cuts(2, 2, 4), 2))).toEqual([2, 2]);
  });

  it("refuses to remove the only cut", () => {
    expect(removeCut(cuts(5), 0)).toEqual(cuts(5));
  });

  it("returns the list unchanged for an out-of-range index", () => {
    expect(removeCut(cuts(2, 2, 4), -1)).toEqual(cuts(2, 2, 4));
    expect(removeCut(cuts(2, 2, 4), 3)).toEqual(cuts(2, 2, 4));
  });
});

describe("clampTotal", () => {
  it("clamps below OMNI_MIN_SECONDS up to it", () => {
    expect(clampTotal(1)).toBe(OMNI_MIN_SECONDS);
    expect(clampTotal(0)).toBe(OMNI_MIN_SECONDS);
  });

  it("clamps above OMNI_MAX_SECONDS down to it", () => {
    expect(clampTotal(99)).toBe(OMNI_MAX_SECONDS);
  });

  it("rounds a fractional value inside the window", () => {
    expect(clampTotal(6.4)).toBe(6);
    expect(clampTotal(6.6)).toBe(7);
  });

  it("leaves an in-window integer untouched", () => {
    expect(clampTotal(7)).toBe(7);
  });
});

describe("fitToTotal", () => {
  // The remainder-elimination step: makes allocated == total in one explicit, operator-triggered
  // move. Growth and shrink both distribute proportionally to current size, with a deterministic
  // largest-remainder rounding so the sum lands EXACTLY on target, never one second short or over.

  it("is a no-op when already balanced (same reference)", () => {
    const original = cuts(3, 3, 4);
    expect(fitToTotal(original, 10)).toBe(original);
  });

  it("distributes an under-allocation proportionally, landing exactly on the target", () => {
    // [2,2,4] sum=8, target=10, diff=+2. Raw shares: 0.5, 0.5, 1.0 -> floors [0,0,1], remainder 1
    // goes to the largest fractional share; ties break toward the lower index.
    const result = fitToTotal(cuts(2, 2, 4), 10);
    expect(secondsOf(result)).toEqual([3, 2, 5]);
    expect(totalOf(result)).toBe(10);
  });

  it("distributes an over-allocation proportionally to slack, landing exactly on the target", () => {
    // [2,2,4] sum=8, target=6, amount=2. Slack above MIN_CUT_SECONDS is [1,1,3] -> raw shares
    // 0.4, 0.4, 1.2 -> floors [0,0,1], remainder 1 goes to the largest fractional share (tie -> index 0).
    const result = fitToTotal(cuts(2, 2, 4), 6);
    expect(secondsOf(result)).toEqual([1, 2, 3]);
    expect(totalOf(result)).toBe(6);
    for (const c of result) expect(c.seconds).toBeGreaterThanOrEqual(MIN_CUT_SECONDS);
  });

  it("shrinks every cut down to exactly MIN_CUT_SECONDS when the target equals the floor", () => {
    const result = fitToTotal(cuts(5, 5), 2);
    expect(secondsOf(result)).toEqual([1, 1]);
    expect(totalOf(result)).toBe(2);
  });

  // The pathological case: more cuts than the requested total allows even at MIN_CUT_SECONDS
  // each. fitToTotal cannot satisfy both "sum == target" and "every cut >= MIN_CUT_SECONDS" here,
  // and the min-cut invariant wins — it holds at the achievable floor (cuts.length * MIN_CUT_SECONDS)
  // instead of manufacturing a sub-1s cut.
  it("holds at the achievable floor when the target is below cuts.length * MIN_CUT_SECONDS", () => {
    const original = cuts(1, 1, 1, 1, 1); // already at the floor (sum 5)
    const result = fitToTotal(original, 3);
    expect(result).toBe(original);
    expect(totalOf(result)).toBe(5);
  });

  it("rounds a three-way split that does not divide evenly", () => {
    // [1,1,1] sum=3, target=10, diff=+7. Equal raw shares (7/3 each = 2.333...) -> floors [2,2,2]
    // sum=6, remainder=1 -> ties broken toward the lowest index.
    const result = fitToTotal(cuts(1, 1, 1), 10);
    expect(totalOf(result)).toBe(10);
    for (const c of result) expect(c.seconds).toBeGreaterThanOrEqual(MIN_CUT_SECONDS);
    expect(secondsOf(result)).toEqual([4, 3, 3]);
  });
});

describe("newCut", () => {
  it("mints a uuid id", () => {
    expect(newCut("x", 2).id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
