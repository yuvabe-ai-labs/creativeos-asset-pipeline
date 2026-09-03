import { describe, it, expect } from "vitest";
import {
  MIN_CUT_SECONDS,
  addCut,
  clampTotal,
  cutsFromShots,
  headroomOf,
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
  // Unaffected by the no-Total rework — this is the one place cuts are constructed from
  // external data, unrelated to how the ladder relates to the ceiling afterward.
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

describe("totalOf", () => {
  it("sums the cuts' seconds", () => {
    expect(totalOf(cuts(2, 3, 4))).toBe(9);
  });

  it("is 0 for an empty ladder", () => {
    expect(totalOf([])).toBe(0);
  });
});

describe("headroomOf", () => {
  it("is the unspent seconds under OMNI_MAX_SECONDS", () => {
    expect(headroomOf(cuts(2, 2, 4))).toBe(OMNI_MAX_SECONDS - 8);
  });

  it("is 0 exactly at the ceiling", () => {
    expect(headroomOf(cuts(OMNI_MAX_SECONDS))).toBe(0);
  });

  it("never goes negative when the ladder is somehow over the ceiling", () => {
    expect(headroomOf(cuts(OMNI_MAX_SECONDS + 5))).toBe(0);
  });
});

describe("maxSecondsFor", () => {
  it("returns the cut's own seconds plus the ladder's headroom", () => {
    // [2,2,4] total=8, headroom under 10 is 2. index 0 -> 2+2=4. index 2 -> 4+2=6.
    expect(maxSecondsFor(cuts(2, 2, 4), 0)).toBe(4);
    expect(maxSecondsFor(cuts(2, 2, 4), 2)).toBe(6);
  });

  it("lets a single cut's ceiling reach OMNI_MAX_SECONDS", () => {
    expect(maxSecondsFor(cuts(5), 0)).toBe(OMNI_MAX_SECONDS);
  });

  // The key "stops growing" behavior: when the ladder is already full, a cut's ceiling is
  // exactly its own current length — the slider has nowhere left to go.
  it("returns the cut's own length when the ladder is already full", () => {
    expect(maxSecondsFor(cuts(6, 4), 0)).toBe(6);
    expect(maxSecondsFor(cuts(6, 4), 1)).toBe(4);
  });

  it("floors at MIN_CUT_SECONDS when the list is somehow already over the ceiling", () => {
    // [1,14]: index 0's raw headroom is 1+(10-15) = -4, floored at 1.
    expect(maxSecondsFor(cuts(1, 14), 0)).toBe(MIN_CUT_SECONDS);
  });

  it("returns 0 for an out-of-range index", () => {
    expect(maxSecondsFor(cuts(2, 2, 4), -1)).toBe(0);
    expect(maxSecondsFor(cuts(2, 2, 4), 3)).toBe(0);
  });
});

describe("resizeCut", () => {
  // The operator's explicit, hardest requirement: growing or shrinking one cut must never touch
  // another. See the "mutation check" in the report — this test was confirmed to actually fail
  // when a neighbour is touched, not just written to look thorough.
  it("changes only the targeted cut, leaving every other cut byte-identical", () => {
    const original = cuts(2, 2, 4);
    const result = resizeCut(original, 0, 4);
    expect(secondsOf(result)).toEqual([4, 2, 4]);
    expect(result[1]).toBe(original[1]); // same object reference — untouched, not just equal
    expect(result[2]).toBe(original[2]);
  });

  it("resizing the last cut leaves every earlier cut untouched (same references)", () => {
    const original = cuts(2, 2, 4);
    const result = resizeCut(original, 2, 6);
    expect(secondsOf(result)).toEqual([2, 2, 6]);
    expect(result[0]).toBe(original[0]);
    expect(result[1]).toBe(original[1]);
  });

  it("grows only into available headroom, stopping at the 10s ceiling", () => {
    // [2,2,4] total=8, headroom=2 -> cut 0 can reach 4, and a request for more clamps there.
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 4))).toEqual([4, 2, 4]);
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 9))).toEqual([4, 2, 4]);
    expect(totalOf(resizeCut(cuts(2, 2, 4), 0, 9))).toBe(OMNI_MAX_SECONDS);
  });

  it("lets a single cut grow all the way to OMNI_MAX_SECONDS, not past it", () => {
    expect(secondsOf(resizeCut(cuts(5), 0, 8))).toEqual([8]);
    expect(secondsOf(resizeCut(cuts(5), 0, 20))).toEqual([OMNI_MAX_SECONDS]);
  });

  it("cannot go below MIN_CUT_SECONDS (1)", () => {
    expect(secondsOf(resizeCut(cuts(3, 2, 3), 0, 0))).toEqual([1, 2, 3]);
  });

  it("returns the list unchanged for a negative index", () => {
    expect(resizeCut(cuts(2, 2, 4), -1, 3)).toEqual(cuts(2, 2, 4));
  });

  it("returns the list unchanged for an index one past the end", () => {
    expect(resizeCut(cuts(2, 2, 4), 3, 3)).toEqual(cuts(2, 2, 4));
  });

  it("is a no-op (same reference) when asked for the seconds it already has", () => {
    const original = cuts(2, 2, 4);
    expect(resizeCut(original, 0, 2)).toBe(original);
  });
});

describe("addCut", () => {
  // DEFERRED — unused today (see the module header), but kept honest against the new model: a
  // new cut is funded by headroom under OMNI_MAX_SECONDS.
  it("appends a 1s cut when there is headroom, growing the total", () => {
    const result = addCut(cuts(2, 2, 4));
    expect(secondsOf(result)).toEqual([2, 2, 4, 1]);
    expect(totalOf(result)).toBe(9);
  });

  it("gives the new cut a distinct id and empty text", () => {
    const result = addCut(cuts(4));
    expect(result[1].text).toBe("");
    expect(result[1].id).not.toBe(result[0].id);
  });

  it("refuses when the ladder is already at OMNI_MAX_SECONDS", () => {
    expect(addCut(cuts(OMNI_MAX_SECONDS))).toEqual(cuts(OMNI_MAX_SECONDS));
  });

  it("succeeds at the boundary — exactly 1s of headroom is enough", () => {
    expect(totalOf(addCut(cuts(OMNI_MAX_SECONDS - 1)))).toBe(OMNI_MAX_SECONDS);
  });
});

describe("removeCut", () => {
  it("shortens the ladder and leaves the other cuts alone", () => {
    const original = cuts(2, 2, 4);
    const result = removeCut(original, 0);
    expect(secondsOf(result)).toEqual([2, 4]);
    expect(totalOf(result)).toBe(6);
    expect(result[0]).toBe(original[1]);
    expect(result[1]).toBe(original[2]);
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

describe("newCut", () => {
  it("mints a uuid id", () => {
    expect(newCut("x", 2).id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
