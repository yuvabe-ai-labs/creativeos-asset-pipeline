import { describe, it, expect } from "vitest";
import type { AppNode } from "@/lib/canvas-nodes";
import {
  FAN_OUT_CARDS, PANEL_CARD, PANEL_GAP, STORYBOARD_ROW_PITCH, storyboardPanelNodes,
} from "../storyboard-canvas";
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

  it("adds a File node per matching row, centred under its shot's card, wired into the image handle", () => {
    const { nodes, edges } = storyboardPanelNodes([node("a", "shot", [0], 100)], rows, panels);
    expect(nodes).toHaveLength(1);
    const card = FAN_OUT_CARDS.shot;
    expect(nodes[0]).toMatchObject({
      type: "file",
      position: { x: 400 + (card.width - PANEL_CARD.width) / 2, y: 100 + card.height + PANEL_GAP },
      data: { title: "S1 · HOOK — storyboard", fileKind: "image", fileUrl: panels[0].url, fileExt: "webp", filename: "S1-storyboard.webp" },
    });
    expect(edges).toEqual([{ id: expect.any(String), source: nodes[0].id, target: "a", targetHandle: "image" }]);
  });

  it("wires a Multishot the same way, under its taller, wider card", () => {
    const { nodes, edges } = storyboardPanelNodes([node("m", "multishot", [1])], rows, panels);
    expect(edges[0]).toMatchObject({ target: "m", targetHandle: "image" });
    const card = FAN_OUT_CARDS.multishot;
    expect(nodes[0].position).toEqual({ x: 400 + (card.width - PANEL_CARD.width) / 2, y: card.height + PANEL_GAP });
  });

  it("spaces rows so a panel never reaches the next shot, and the chain's tallest card fits a row", () => {
    for (const card of Object.values(FAN_OUT_CARDS)) {
      expect(card.height + PANEL_GAP + PANEL_CARD.height).toBeLessThan(STORYBOARD_ROW_PITCH - 40);
    }
    // Image gen and Video gen with 9:16 output, which Next lines up in each shot's row.
    expect(590).toBeLessThan(STORYBOARD_ROW_PITCH - 40);
  });

  it("gives an unnamed row nothing", () => {
    expect(storyboardPanelNodes([node("c", "shot", [2])], rows, panels).nodes).toEqual([]);
  });

  it("gives a node covering several rows one panel per row, never one shot twice", () => {
    const twice = [{ label: "S1" }, { label: "s1" }, { label: "S2" }];
    const { nodes } = storyboardPanelNodes([node("g", "shot", [0, 1, 2])], twice, panels);
    expect(nodes.map((n) => (n.data as { title: string }).title)).toEqual(["S1 · HOOK — storyboard", "S2 · HOOK — storyboard"]);
    // Side by side, never overlapping, and the pair centred under the card together.
    expect(nodes[1].position.x).toBeGreaterThanOrEqual(nodes[0].position.x + PANEL_CARD.width);
    const mid = (nodes[0].position.x + nodes[1].position.x + PANEL_CARD.width) / 2;
    expect(mid).toBe(400 + FAN_OUT_CARDS.shot.width / 2);
  });

  it("does nothing without a storyboard", () => {
    expect(storyboardPanelNodes([node("a", "shot", [0])], rows, undefined)).toEqual({ nodes: [], edges: [] });
  });
});
