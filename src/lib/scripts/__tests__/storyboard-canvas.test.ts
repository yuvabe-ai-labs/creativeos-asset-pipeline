import { describe, it, expect } from "vitest";
import type { AppNode } from "@/lib/canvas-nodes";
import { PANEL_DY, storyboardPanelNodes } from "../storyboard-canvas";
import type { StoryboardPanel } from "../storyboard";

const panel = (n: number): StoryboardPanel => ({
  label: `S${n}`, beat: "HOOK", shotId: `s0${n}`,
  url: `https://x.supabase.co/storage/v1/object/public/assets/clients/c/scripts/s/panels/s0${n}/panel__a.webp`,
});
const node = (id: string, type: "shot" | "multishot", shotIndexes: number[], y = 0): AppNode =>
  ({ id, type, position: { x: 400, y }, data: { seededFrom: { scriptNodeId: "sc", shotIndexes } } }) as AppNode;

describe("storyboardPanelNodes (D382)", () => {
  const rows = [{ label: "S1" }, { label: "S2" }, { label: "" }];
  const panels = [panel(1), panel(2), panel(3)];

  it("adds a File node per matching row, below its shot, wired into the image handle", () => {
    const { nodes, edges } = storyboardPanelNodes([node("a", "shot", [0], 100)], rows, panels);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      type: "file",
      position: { x: 400, y: 100 + PANEL_DY },
      data: { title: "S1 · HOOK — storyboard", fileKind: "image", fileUrl: panels[0].url, fileExt: "webp", filename: "S1-storyboard.webp" },
    });
    expect(edges).toEqual([{ id: expect.any(String), source: nodes[0].id, target: "a", targetHandle: "image" }]);
  });

  it("wires a Multishot the same way", () => {
    const { edges } = storyboardPanelNodes([node("m", "multishot", [1])], rows, panels);
    expect(edges[0]).toMatchObject({ target: "m", targetHandle: "image" });
  });

  it("gives an unnamed row nothing", () => {
    expect(storyboardPanelNodes([node("c", "shot", [2])], rows, panels).nodes).toEqual([]);
  });

  it("gives a node covering several rows one panel per row, never one shot twice", () => {
    const twice = [{ label: "S1" }, { label: "s1" }, { label: "S2" }];
    const { nodes } = storyboardPanelNodes([node("g", "shot", [0, 1, 2])], twice, panels);
    expect(nodes.map((n) => (n.data as { title: string }).title)).toEqual(["S1 · HOOK — storyboard", "S2 · HOOK — storyboard"]);
    expect(nodes[1].position.x).toBeGreaterThan(nodes[0].position.x);
  });

  it("does nothing without a storyboard", () => {
    expect(storyboardPanelNodes([node("a", "shot", [0])], rows, undefined)).toEqual({ nodes: [], edges: [] });
  });
});
