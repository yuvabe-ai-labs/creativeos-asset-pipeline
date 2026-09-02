import { describe, it, expect } from "vitest";
import {
  MIN_CUT_SECONDS,
  addCut,
  cutsFromShots,
  newCut,
  removeCut,
  resizeCut,
  shotsFromCuts,
  totalOf,
} from "../multishot-cuts";
import type { MultishotCut } from "../multishot-cuts";

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
  // Dragging the handle between cut 0 and cut 1: what 0 gains, 1 loses. The total is the
  // contract with the Omni request's duration and must not move.
  it("takes the delta from the next cut, preserving the total", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 3))).toEqual([3, 1, 4]);
    expect(totalOf(resizeCut(cuts(2, 2, 4), 0, 3))).toBe(8);
  });

  it("gives seconds back to the next cut when shrinking", () => {
    expect(secondsOf(resizeCut(cuts(3, 2, 3), 0, 1))).toEqual([1, 4, 3]);
  });

  // A drag that would starve the neighbour stops rather than deleting it. Cuts are only ever
  // removed deliberately.
  it("stops before pushing the neighbour below the floor", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 0, 9))).toEqual([3, 1, 4]);
  });

  it("clamps the dragged cut to the floor too", () => {
    expect(secondsOf(resizeCut(cuts(3, 2, 3), 0, 0))).toEqual([1, 4, 3]);
  });

  // The last cut has no next neighbour, so it borrows backward instead.
  it("takes from the previous cut when resizing the last one", () => {
    expect(secondsOf(resizeCut(cuts(2, 2, 4), 2, 5))).toEqual([2, 1, 5]);
  });

  it("is a no-op on a single cut — there is nobody to trade with", () => {
    expect(secondsOf(resizeCut(cuts(5), 0, 8))).toEqual([5]);
  });
});

describe("addCut", () => {
  // The budget is fixed, so a new cut is funded by the largest existing one.
  it("appends a 1s cut funded by the largest, preserving the total", () => {
    const result = addCut(cuts(2, 2, 4));
    expect(secondsOf(result)).toEqual([2, 2, 3, 1]);
    expect(totalOf(result)).toBe(8);
  });

  it("gives the new cut a distinct id and empty text", () => {
    const result = addCut(cuts(4));
    expect(result[1].text).toBe("");
    expect(result[1].id).not.toBe(result[0].id);
  });

  it("refuses when no cut can spare a second", () => {
    expect(addCut(cuts(1, 1))).toEqual(cuts(1, 1));
  });
});

describe("removeCut", () => {
  it("gives the removed cut's seconds to the next one", () => {
    const result = removeCut(cuts(2, 2, 4), 0);
    expect(secondsOf(result)).toEqual([4, 4]);
    expect(totalOf(result)).toBe(8);
  });

  it("gives them to the previous one when removing the last", () => {
    expect(secondsOf(removeCut(cuts(2, 2, 4), 2))).toEqual([2, 6]);
  });

  it("refuses to remove the only cut", () => {
    expect(removeCut(cuts(5), 0)).toEqual(cuts(5));
  });
});

describe("the budget invariant", () => {
  // The property the whole module exists to hold: no sequence of operations changes the total.
  it("survives resize, add and remove in any order", () => {
    let list = cuts(3, 3, 2);
    list = resizeCut(list, 0, 5);
    list = addCut(list);
    list = removeCut(list, 1);
    list = resizeCut(list, 1, 1);
    expect(totalOf(list)).toBe(8);
    for (const c of list) expect(c.seconds).toBeGreaterThanOrEqual(MIN_CUT_SECONDS);
  });
});

describe("newCut", () => {
  it("mints a uuid id", () => {
    expect(newCut("x", 2).id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
