import { describe, it, expect } from "vitest";
import { tallyCanvasCost, sumNodeCredits } from "../canvas-cost";

describe("tallyCanvasCost", () => {
  it("totals settled credits per node and for the whole canvas", () => {
    expect(
      tallyCanvasCost([
        { node_id: "a", credits_charged: 10 },
        { node_id: "a", credits_charged: 5 },
        { node_id: "b", credits_charged: 3 },
      ]),
    ).toEqual({ totalCredits: 18, byNode: { a: 15, b: 3 } });
  });

  it("counts legacy rows with no settled credits as zero", () => {
    expect(tallyCanvasCost([{ node_id: "a", credits_charged: null }])).toEqual({
      totalCredits: 0,
      byNode: { a: 0 },
    });
  });

  it("keeps a row with no node in the canvas total only", () => {
    expect(tallyCanvasCost([{ node_id: null, credits_charged: 4 }])).toEqual({
      totalCredits: 4,
      byNode: {},
    });
  });
});

describe("sumNodeCredits", () => {
  const byNode = { a: 15, b: 3 };

  it("adds up the given nodes", () => {
    expect(sumNodeCredits(byNode, ["a", "b"])).toBe(18);
  });

  it("treats a node with no generations as zero", () => {
    expect(sumNodeCredits(byNode, ["a", "unsaved"])).toBe(15);
  });

  it("counts a node listed twice only once", () => {
    expect(sumNodeCredits(byNode, ["a", "a"])).toBe(15);
  });
});
