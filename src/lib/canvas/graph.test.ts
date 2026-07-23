import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import { wouldCreateCycle, findAncestorOfType, findDescendantsOfType } from "./graph";

const e = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });
const n = (id: string, type: string) => ({ id, type });

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

describe("findAncestorOfType", () => {
  it("walks upstream to the nearest ancestor of the given type", () => {
    const nodes = [n("s", "shot"), n("p", "prompt"), n("g", "image-gen")];
    const edges = [e("s", "p"), e("p", "g")];
    expect(findAncestorOfType("g", nodes, edges, "shot")?.id).toBe("s");
  });

  it("finds an image-gen ancestor across a video-prompt", () => {
    const nodes = [n("ig", "image-gen"), n("vp", "video-prompt"), n("vg", "video-gen")];
    const edges = [e("ig", "vp"), e("vp", "vg")];
    expect(findAncestorOfType("vg", nodes, edges, "image-gen")?.id).toBe("ig");
  });

  it("returns null when no ancestor of that type exists", () => {
    const nodes = [n("f", "file"), n("g", "image-gen")];
    expect(findAncestorOfType("g", nodes, [e("f", "g")], "shot")).toBeNull();
  });
});

describe("findDescendantsOfType", () => {
  const nodes = [
    n("p", "video-prompt"),
    n("g1", "video-gen"),
    n("g2", "video-gen"),
    n("x", "file"),
  ];

  it("returns all downstream nodes of the given type", () => {
    const edges = [e("p", "g1"), e("p", "g2"), e("x", "p")];
    const found = findDescendantsOfType("p", nodes, edges, "video-gen");
    expect(found.map((node) => node.id).sort()).toEqual(["g1", "g2"]);
  });

  it("returns [] when there are no downstream nodes of the type", () => {
    expect(findDescendantsOfType("p", nodes, [e("x", "p")], "video-gen")).toEqual([]);
  });
});
