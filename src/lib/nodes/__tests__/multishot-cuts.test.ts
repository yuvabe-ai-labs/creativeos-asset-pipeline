import { describe, it, expect } from "vitest";
import {
  MIN_CUT_SECONDS,
  addCut,
  cutsFromShots,
  maxSecondsFor,
  newCut,
  removeCut,
  resizeCut,
  shotsFromCuts,
  totalOf,
} from "../multishot-cuts";
import type { MultishotCut } from "../multishot-cuts";
import { OMNI_MAX_SECONDS } from "../group-shots";

const cuts = (...seconds: number[]): MultishotCut[] =>
  seconds.map((s, i) => ({ id: `c${i}`, text: `cut ${i + 1}`, seconds: s }));

const secondsOf = (cs: MultishotCut[]) => cs.map((c) => c.seconds);

describe("cutsFromShots", () => {
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
  // The inverse used when a Multishot node is flipped back to a Shot. `duration_seconds` is
  // the field grouping does arithmetic on, so it must be the one written.
  it("round-trips text and seconds back into ReelShots", () => {
    expect(shotsFromCuts(cuts(2, 3))).toEqual([
      { description: "cut 1", duration_seconds: 2 },
      { description: "cut 2", duration_seconds: 3 },
    ]);
  });
});

describe("resizeCut", () => {
  // The new model: growing one cut is funded by headroom under the shared ceiling, never by a
  // neighbour. Neighbours must come back byte-for-byte unchanged.
  it("changes only the targeted cut, leaving neighbours untouched", () => {
    // [2,2,4] total=8, headroom under 10 is 2 — cut 0 can grow to 4.
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 4))).toEqual([4, 2, 4]);
  });

  it("cannot be dragged past the point where the total would exceed the 10s ceiling", () => {
    // [2,2,4] total=8; cut 0's ceiling is 2 + (10-8) = 4. Asking for 9 clamps to 4.
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 9))).toEqual([4, 2, 4]);
    expect(totalOf(resizeCut(cuts(2, 2, 4), 0, 9))).toBe(10);
  });

  it("cannot go below MIN_CUT_SECONDS (1)", () => {
    expect(secondsOf(resizeCut(cuts(3, 2, 3), 0, 0))).toEqual([1, 2, 3]);
  });

  // A lone cut used to be a no-op (nobody to trade with). Under the shared ceiling it has real
  // headroom of its own and can grow all the way to the cap.
  it("lets a single cut grow all the way to the ceiling now that there is no partner to starve", () => {
    expect(secondsOf(resizeCut(cuts(5), 0, 8))).toEqual([8]);
    expect(secondsOf(resizeCut(cuts(5), 0, 20))).toEqual([10]);
  });

  it("resizing the last cut leaves every earlier cut untouched", () => {
    // [2,2,4] total=8; cut 2's ceiling is 4 + (10-8) = 6.
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 2, 6))).toEqual([2, 2, 6]);
  });

  it("returns the list unchanged for a negative index", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), -1, 3))).toEqual([2, 2, 4]);
  });

  it("returns the list unchanged for an index one past the end", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 3, 3))).toEqual([2, 2, 4]);
  });

  it("is a no-op when asked for the seconds it already has", () => {
    const original = cuts(2, 2, 4);
    expect(resizeCut(original, 0, 2)).toBe(original);
  });
});

describe("maxSecondsFor", () => {
  // Headroom is shared across the whole list, not paired with one neighbour: a cut's ceiling is
  // its own current length plus however much room is left under OMNI_MAX_SECONDS.
  it("returns the cut's own seconds plus the list's headroom under the ceiling", () => {
    // [2,2,4]: total=8, headroom=2. index 0 -> 2+2=4. index 2 -> 4+2=6.
    expect(maxSecondsFor(cuts(2, 2, 4), 0)).toBe(4);
    expect(maxSecondsFor(cuts(2, 2, 4), 2)).toBe(6);
  });

  it("lets a single cut's ceiling reach OMNI_MAX_SECONDS", () => {
    expect(maxSecondsFor(cuts(5), 0)).toBe(OMNI_MAX_SECONDS);
  });

  it("is capped at OMNI_MAX_SECONDS even if the raw headroom math would exceed it", () => {
    // A cut already sitting at the ceiling with nothing else in the list.
    expect(maxSecondsFor(cuts(10), 0)).toBe(OMNI_MAX_SECONDS);
  });

  it("floors at MIN_CUT_SECONDS when the list is already over budget", () => {
    // An over-cap neighbour (a lone shot longer than Omni's max — see group-shots.ts) can leave
    // the total above OMNI_MAX_SECONDS. A small cut's ceiling must still floor at MIN_CUT_SECONDS
    // rather than go negative: [1,14] totals 15, so index 0's raw headroom is 1+(10-15) = -4.
    expect(maxSecondsFor(cuts(1, 14), 0)).toBe(MIN_CUT_SECONDS);
  });

  it("returns 0 for an out-of-range index", () => {
    expect(maxSecondsFor(cuts(2, 2, 4), -1)).toBe(0);
    expect(maxSecondsFor(cuts(2, 2, 4), 3)).toBe(0);
  });
});

describe("addCut", () => {
  // The new model: a new cut is funded by unused headroom under the ceiling, not by taking
  // seconds from the largest existing cut.
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

  it("refuses when the total is already at the ceiling", () => {
    expect(addCut(cuts(10))).toEqual(cuts(10));
  });

  it("succeeds at the boundary — exactly 1s of headroom is enough for one more MIN_CUT_SECONDS cut", () => {
    expect(totalOf(addCut(cuts(9)))).toBe(10);
  });
});

describe("removeCut", () => {
  // The total shrinks by exactly the removed cut's seconds — nobody inherits them.
  it("shrinks the total and leaves the other cuts alone", () => {
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

describe("the ceiling invariant", () => {
  // The property the whole module exists to hold now: the total never exceeds OMNI_MAX_SECONDS,
  // and no cut ever drops below MIN_CUT_SECONDS — through any sequence of operations.
  it("survives resize, add and remove in any order", () => {
    let list = cuts(3, 3, 2);
    list = resizeCut(list, 0, 5); // total capped at 10
    list = addCut(list); // refused — no headroom left
    list = removeCut(list, 1); // shrinks the total
    list = resizeCut(list, 1, 1);
    expect(totalOf(list)).toBeLessThanOrEqual(OMNI_MAX_SECONDS);
    for (const c of list) expect(c.seconds).toBeGreaterThanOrEqual(MIN_CUT_SECONDS);
  });

  it("never lets a resize push the total past the ceiling, regardless of the requested value", () => {
    let list = cuts(4, 4, 2);
    for (const amount of [50, -50, 7, 3, 100]) {
      list = resizeCut(list, 0, amount);
      expect(totalOf(list)).toBeLessThanOrEqual(OMNI_MAX_SECONDS);
    }
  });
});

describe("newCut", () => {
  it("mints a uuid id", () => {
    expect(newCut("x", 2).id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
