import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import { wouldCreateCycle } from "./graph";

const e = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

describe("wouldCreateCycle", () => {
  it("is false for a fresh connection on an empty graph", () => {
    expect(wouldCreateCycle([], "A", "B")).toBe(false);
  });

  it("rejects a self-loop", () => {
    expect(wouldCreateCycle([], "A", "A")).toBe(true);
  });

  it("rejects the closing edge of a 2-cycle", () => {
    // A -> B exists; adding B -> A closes a loop
    expect(wouldCreateCycle([e("A", "B")], "B", "A")).toBe(true);
  });

  it("rejects the closing edge of a longer chain", () => {
    // A -> B -> C exists; adding C -> A closes a loop
    expect(wouldCreateCycle([e("A", "B"), e("B", "C")], "C", "A")).toBe(true);
  });

  it("allows a diamond (no cycle)", () => {
    // A -> B, A -> C, B -> D, C -> D ; adding nothing problematic
    const edges = [e("A", "B"), e("A", "C"), e("B", "D"), e("C", "D")];
    expect(wouldCreateCycle(edges, "A", "D")).toBe(false); // A already reaches D, but A->D adds no loop
  });
});
