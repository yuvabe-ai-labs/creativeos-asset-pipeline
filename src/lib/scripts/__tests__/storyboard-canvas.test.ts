import { describe, it, expect } from "vitest";
import type { AppNode } from "@/lib/canvas-nodes";
import {
  CHAIN_ROW_MIN, FAN_OUT_CARDS, PANEL_CARD, PANEL_GAP, ROW_GAP, STORYBOARD_ROW_PITCH, settleFanOutRows, storyboardPanelNodes,
} from "../storyboard-canvas";
import type { StoryboardPanel } from "../storyboard";

const panel = (n: number): StoryboardPanel => ({
  label: `S${n}`, beat: "HOOK", shotId: `s0${n}`, takeId: `t${n}`,
  url: `https://x.supabase.co/storage/v1/object/public/assets/clients/c/scripts/s/panels/s0${n}/panel__a.webp`,
});
const node = (id: string, type: "shot" | "multishot", shotIndexes: number[], y = 0): AppNode =>
  ({ id, type, position: { x: 400, y }, data: { seededFrom: { scriptNodeId: "sc", shotIndexes } } }) as AppNode;

describe("storyboardPanelNodes (D382, D454)", () => {
  const rows = [{ label: "S1" }, { label: "S2" }, { label: "" }];
  const panels = [panel(1), panel(2), panel(3)];

  it("asks for a Composite per matching row, centred under its shot's card, wired into the image handle", () => {
    const { requests, edges } = storyboardPanelNodes([node("a", "shot", [0], 100)], rows, panels);
    expect(requests).toHaveLength(1);
    const card = FAN_OUT_CARDS.shot;
    expect(requests[0]).toEqual({
      nodeId: expect.any(String),
      label: "S1",
      position: { x: 400 + (card.width - PANEL_CARD.width) / 2, y: 100 + card.height + PANEL_GAP },
    });
    expect(edges).toEqual([{ id: expect.any(String), source: requests[0].nodeId, target: "a", targetHandle: "image" }]);
  });

  it("wires a Multishot the same way, under its taller, wider card", () => {
    const { requests, edges } = storyboardPanelNodes([node("m", "multishot", [1])], rows, panels);
    expect(edges[0]).toMatchObject({ target: "m", targetHandle: "image" });
    const card = FAN_OUT_CARDS.multishot;
    expect(requests[0].position).toEqual({ x: 400 + (card.width - PANEL_CARD.width) / 2, y: card.height + PANEL_GAP });
  });

  it("spaces rows so a panel never reaches the next shot, and the chain's tallest card fits a row", () => {
    for (const card of Object.values(FAN_OUT_CARDS)) {
      expect(card.height + PANEL_GAP + PANEL_CARD.height).toBeLessThan(STORYBOARD_ROW_PITCH - 40);
    }
    // Image gen and Video gen with 9:16 output, which Next lines up in each shot's row.
    expect(590).toBeLessThan(STORYBOARD_ROW_PITCH - 40);
  });

  it("gives an unnamed row nothing", () => {
    expect(storyboardPanelNodes([node("c", "shot", [2])], rows, panels).requests).toEqual([]);
  });

  it("gives a node covering several rows one panel per row, never one shot twice", () => {
    const twice = [{ label: "S1" }, { label: "s1" }, { label: "S2" }];
    const { requests: nodes } = storyboardPanelNodes([node("g", "shot", [0, 1, 2])], twice, panels);
    expect(nodes.map((n) => n.label)).toEqual(["S1", "S2"]);
    // Side by side, never overlapping, and the pair centred under the card together.
    expect(nodes[1].position.x).toBeGreaterThanOrEqual(nodes[0].position.x + PANEL_CARD.width);
    const mid = (nodes[0].position.x + nodes[1].position.x + PANEL_CARD.width) / 2;
    expect(mid).toBe(400 + FAN_OUT_CARDS.shot.width / 2);
  });

  it("does nothing without a storyboard", () => {
    expect(storyboardPanelNodes([node("a", "shot", [0])], rows, undefined)).toEqual({ requests: [], edges: [] });
  });
});

describe("settleFanOutRows (D382 amended)", () => {
  const at = (x: number, y: number, w?: number, h?: number) => ({ position: { x, y }, ...(w && h ? { measured: { width: w, height: h } } : {}) });

  it("stacks rows from the cards' measured sizes: each panel just under its shot, rows clear of each other", () => {
    const nodes = new Map([
      ["s1", at(400, 0, 224, 295)], ["p1", at(0, 0, 202, 466)],
      ["s2", at(400, 800, 224, 330)], ["p2", at(0, 0, 202, 466)],
    ]);
    const moves = settleFanOutRows(nodes, { top: 0, rows: [{ shotId: "s1", panelIds: ["p1"] }, { shotId: "s2", panelIds: ["p2"] }] });
    expect(moves.get("p1")).toEqual({ x: 400 + (224 - 202) / 2, y: 295 + PANEL_GAP });
    const row1Bottom = 295 + PANEL_GAP + 466;
    expect(moves.get("s2")).toEqual({ x: 400, y: row1Bottom + ROW_GAP });
    expect(moves.get("p2")?.y).toBe(row1Bottom + ROW_GAP + 330 + PANEL_GAP);
  });

  it("keeps a row at least as tall as the chain's output cards, even with a short panel", () => {
    const nodes = new Map([
      ["s1", at(400, 100, 224, 200)], ["p1", at(0, 0, 280, 160)],
      ["s2", at(400, 0, 224, 200)],
    ]);
    const moves = settleFanOutRows(nodes, { top: 100, rows: [{ shotId: "s1", panelIds: ["p1"] }, { shotId: "s2", panelIds: [] }] });
    expect(moves.get("s1")).toBeUndefined(); // already where it belongs: no write
    expect(moves.get("s2")?.y).toBe(100 + CHAIN_ROW_MIN + ROW_GAP);
  });

  it("falls back to the estimates for a card not measured yet, and skips a node that is gone", () => {
    const nodes = new Map([["s1", at(400, 0)], ["p1", at(0, 0)]]);
    const moves = settleFanOutRows(nodes, { top: 0, rows: [{ shotId: "s1", panelIds: ["p1", "gone"] }, { shotId: "gone", panelIds: [] }] });
    expect(moves.get("p1")?.y).toBe(FAN_OUT_CARDS.shot.height + PANEL_GAP);
    expect(moves.has("gone")).toBe(false);
  });

  it("returns nothing when every node already sits where it belongs", () => {
    const nodes = new Map([["s1", at(400, 0, 224, 295)], ["p1", at(411, 295 + PANEL_GAP, 202, 466)]]);
    expect(settleFanOutRows(nodes, { top: 0, rows: [{ shotId: "s1", panelIds: ["p1"] }] }).size).toBe(0);
  });
});

describe("storyboardPanelNodes, without a storyboard", () => {
  const rows = [{ label: "S1" }];
  it("does nothing", () => {
    expect(storyboardPanelNodes([node("a", "shot", [0])], rows, undefined)).toEqual({ requests: [], edges: [] });
  });
});
