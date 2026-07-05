import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { findShotAncestor, resolveShotLabel } from "./generation-tray";

// Minimal node/edge factories — only the fields the walk reads.
const node = (id: string, type: string, data: Record<string, unknown> = {}): AppNode =>
  ({ id, type, position: { x: 0, y: 0 }, data } as AppNode);
const edge = (source: string, target: string): Edge =>
  ({ id: `${source}-${target}`, source, target });

describe("findShotAncestor", () => {
  it("walks image-gen ← prompt ← shot", () => {
    const nodes = [node("s", "shot", { order: 3 }), node("p", "prompt"), node("g", "image-gen")];
    const edges = [edge("s", "p"), edge("p", "g")];
    expect(findShotAncestor("g", nodes, edges)?.id).toBe("s");
  });

  it("walks video-gen ← video-prompt ← shot", () => {
    const nodes = [node("s", "shot", { order: 1 }), node("vp", "video-prompt"), node("vg", "video-gen")];
    const edges = [edge("s", "vp"), edge("vp", "vg")];
    expect(findShotAncestor("vg", nodes, edges)?.id).toBe("s");
  });

  it("returns null when no shot ancestor exists", () => {
    const nodes = [node("f", "file"), node("g", "image-gen")];
    const edges = [edge("f", "g")];
    expect(findShotAncestor("g", nodes, edges)).toBeNull();
  });
});

describe("resolveShotLabel", () => {
  it("labels by the shot's 1-based order", () => {
    const nodes = [node("s", "shot", { order: 3 }), node("p", "prompt"), node("g", "image-gen")];
    const edges = [edge("s", "p"), edge("p", "g")];
    expect(resolveShotLabel("g", nodes, edges)).toBe("Shot 3");
  });

  it("falls back to the node's own title when there is no shot", () => {
    const nodes = [node("g", "image-gen", { title: "Hero still" })];
    expect(resolveShotLabel("g", [], [])).toBe("Untitled"); // node not in list → fallback
    expect(resolveShotLabel("g", nodes, [])).toBe("Hero still");
  });
});
