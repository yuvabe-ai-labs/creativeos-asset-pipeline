import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import {
  COLLAPSED_SHOT_HANDLE,
  buildCollapseModel,
  collapseGuardActions,
  collapsedShotIds,
  hiddenCountByShot,
  hiddenNodeIds,
  rerouteEdges,
  withoutCollapsed,
  type CollapseModel,
} from "./shot-collapse";

type N = { id: string; type: string; data?: Record<string, unknown> };
type E = Edge;

const node = (id: string, type: string, data?: Record<string, unknown>): N => ({ id, type, data });
const edge = (source: string, target: string, targetHandle?: string): E => ({
  id: `${source}-${target}`,
  source,
  target,
  ...(targetHandle ? { targetHandle } : {}),
});

// One shot's chain: shot → prompt → image-gen → video-prompt → video-gen.
function chain(n: number): { nodes: N[]; edges: E[] } {
  const ids = [`s${n}`, `p${n}`, `img${n}`, `mp${n}`, `vid${n}`];
  const types = ["shot", "prompt", "image-gen", "video-prompt", "video-gen"];
  return {
    nodes: ids.map((id, i) => node(id, types[i])),
    edges: ids.slice(1).map((id, i) => edge(ids[i], id)),
  };
}

function graph(...parts: { nodes: N[]; edges: E[] }[]) {
  return { nodes: parts.flatMap((p) => p.nodes), edges: parts.flatMap((p) => p.edges) };
}

const label = (id: string) => id.toUpperCase();
const sorted = (s: Iterable<string>) => [...s].sort();
const pairs = (edges: E[]) => edges.map((e) => `${e.source}->${e.target}`).sort();

describe("buildCollapseModel — ownership", () => {
  it("owns a shot's whole chain by that shot", () => {
    const g = graph(chain(1));
    const m = buildCollapseModel(g.nodes, g.edges);
    for (const id of ["p1", "img1", "mp1", "vid1"]) expect(m.owners.get(id)).toEqual(["s1"]);
    expect(m.owners.has("s1")).toBe(false); // a shot owns only itself
  });

  it("Case 1: a cross-shot reference does not steal the other shot's Image Gen", () => {
    const g = graph(chain(1), chain(2), { nodes: [], edges: [edge("img1", "img2")] });
    const m = buildCollapseModel(g.nodes, g.edges);
    expect(m.owners.get("img2")).toEqual(["s2"]);
    expect(m.owners.get("vid2")).toEqual(["s2"]);
  });

  it("gives a node reached equally from two shots both owners", () => {
    const g = graph(
      { nodes: [node("s1", "shot"), node("s2", "shot"), node("ms", "multishot"), node("mp", "multishot-prompt")], edges: [] },
      { nodes: [], edges: [edge("s1", "ms"), edge("s2", "ms"), edge("ms", "mp")] },
    );
    const m = buildCollapseModel(g.nodes, g.edges);
    expect(m.owners.get("ms")).toEqual(["s1", "s2"]);
    expect(m.owners.get("mp")).toEqual(["s1", "s2"]);
  });

  it("Case 2: a file used by one shot is owned; a file used by several is shared", () => {
    const g = graph(chain(1), chain(2), {
      nodes: [node("water", "file"), node("front", "file"), node("panel", "file")],
      edges: [edge("water", "img1"), edge("front", "img1"), edge("front", "img2"), edge("panel", "s1", "image")],
    });
    const m = buildCollapseModel(g.nodes, g.edges);
    expect(m.owners.get("water")).toEqual(["s1"]);
    expect(m.owners.get("panel")).toEqual(["s1"]); // a storyboard panel wired into the shot itself
    expect(m.owners.get("front")).toEqual(["s1", "s2"]);
  });

  it("leaves a file that also feeds an unowned node without owners", () => {
    const g = graph(chain(1), {
      nodes: [node("f", "file"), node("loose", "image-gen")],
      edges: [edge("f", "img1"), edge("f", "loose")],
    });
    expect(buildCollapseModel(g.nodes, g.edges).owners.has("f")).toBe(false);
  });

  it("never owns the script or KB above the shots", () => {
    const g = graph(chain(1), {
      nodes: [node("kb", "kb"), node("script", "script")],
      edges: [edge("kb", "script"), edge("script", "s1")],
    });
    const m = buildCollapseModel(g.nodes, g.edges);
    expect(m.owners.has("script")).toBe(false);
    expect(m.owners.has("kb")).toBe(false);
  });
});

describe("hiddenNodeIds", () => {
  const g = graph(chain(1), chain(2), {
    nodes: [node("water", "file"), node("front", "file")],
    edges: [edge("water", "img1"), edge("front", "img1"), edge("front", "img2")],
  });
  const m = buildCollapseModel(g.nodes, g.edges);

  it("hides nothing when nothing is collapsed", () => {
    expect(hiddenNodeIds(m, new Set()).size).toBe(0);
  });

  it("hides a collapsed shot's chain and its own files, never the shot", () => {
    expect(sorted(hiddenNodeIds(m, new Set(["s1"])))).toEqual(["img1", "mp1", "p1", "vid1", "water"]);
  });

  it("never hides a shared file, even with every shot using it collapsed", () => {
    expect(hiddenNodeIds(m, new Set(["s1", "s2"])).has("front")).toBe(false);
  });

  it("counts hidden nodes per shot", () => {
    const counts = hiddenCountByShot(m, hiddenNodeIds(m, new Set(["s1", "s2"])));
    expect(counts.get("s1")).toBe(5);
    expect(counts.get("s2")).toBe(4);
  });
});

describe("collapsedShotIds", () => {
  it("reads the flag off shot nodes only", () => {
    const nodes = [node("s1", "shot", { collapsed: true }), node("s2", "shot"), node("x", "file", { collapsed: true })];
    expect(sorted(collapsedShotIds(nodes))).toEqual(["s1"]);
  });
});

describe("rerouteEdges", () => {
  function run(g: { nodes: N[]; edges: E[] }, collapsed: string[]) {
    const m: CollapseModel = buildCollapseModel(g.nodes, g.edges);
    return rerouteEdges(g.edges, m, hiddenNodeIds(m, new Set(collapsed)), label);
  }

  it("returns the same array when nothing is hidden", () => {
    const g = graph(chain(1));
    const m = buildCollapseModel(g.nodes, g.edges);
    expect(rerouteEdges(g.edges, m, new Set(), label)).toBe(g.edges);
  });

  it("drops the edges inside a collapsed shot", () => {
    const g = graph(chain(1), { nodes: [node("script", "script")], edges: [edge("script", "s1")] });
    expect(pairs(run(g, ["s1"]))).toEqual(["script->s1"]);
  });

  it("Case 1: keeps the reference link, from the shot, labelled with both Image Gens", () => {
    const g = graph(chain(1), chain(2), { nodes: [], edges: [edge("img1", "img2")] });
    const out = run(g, ["s1"]);
    const link = out.find((e) => e.source === "s1" && e.target === "img2")!;
    expect(link).toBeDefined();
    expect(link.label).toBe("IMG1 → IMG2");
    expect(link.sourceHandle).toBeNull();
    expect(link.selectable).toBe(false);
    expect(link.deletable).toBe(false);
    expect(link.data).toEqual({ memberIds: ["img1-img2"] });
  });

  it("Case 1, both collapsed: the link runs shot to shot through the collapsed handle", () => {
    const g = graph(chain(1), chain(2), { nodes: [], edges: [edge("img1", "img2")] });
    const link = run(g, ["s1", "s2"]).find((e) => e.source === "s1" && e.target === "s2")!;
    expect(link.targetHandle).toBe(COLLAPSED_SHOT_HANDLE);
    expect(link.label).toBe("IMG1 → IMG2");
  });

  it("Case 2: a shared file's lines go to the collapsed shot, unlabelled, one per shot", () => {
    const g = graph(chain(1), chain(2), {
      nodes: [node("front", "file")],
      edges: [edge("front", "img1"), edge("front", "p1"), edge("front", "img2")],
    });
    const out = run(g, ["s1"]);
    const toShot = out.filter((e) => e.source === "front" && e.target === "s1");
    expect(toShot).toHaveLength(1); // two edges into s1's chain become one
    expect(toShot[0].targetHandle).toBe(COLLAPSED_SHOT_HANDLE);
    expect(toShot[0].label).toBeUndefined();
    expect(sorted((toShot[0].data as { memberIds: string[] }).memberIds)).toEqual(["front-img1", "front-p1"]);
    expect(out.some((e) => e.id === "front-img2")).toBe(true); // the expanded shot's line is untouched
  });

  it("drops a rerouted line that duplicates a real edge between the same nodes", () => {
    const g = graph(chain(1), chain(2), {
      nodes: [node("front", "file")],
      edges: [edge("front", "s1", "image"), edge("front", "img1"), edge("front", "img2")],
    });
    const out = run(g, ["s1"]);
    expect(out.filter((e) => e.source === "front" && e.target === "s1")).toHaveLength(1);
    expect(out.find((e) => e.source === "front" && e.target === "s1")!.id).toBe("front-s1");
  });
});

describe("collapseGuardActions", () => {
  const g = graph(chain(1));
  const m = buildCollapseModel(g.nodes, g.edges);
  const hidden = hiddenNodeIds(m, new Set(["s1"]));

  it("deselects hidden nodes when the collapsed set changes", () => {
    const a = collapseGuardActions(m, { collapsedKey: "", hidden: new Set() }, {
      collapsedKey: "s1",
      hidden,
      selectedIds: ["img1", "s1"],
      focusedNodeId: null,
    });
    expect(a).toEqual({ expand: [], deselect: ["img1"] });
  });

  it("expands the owner of a node that became hidden without a collapse", () => {
    const a = collapseGuardActions(m, { collapsedKey: "s1", hidden: new Set(["p1"]) }, {
      collapsedKey: "s1",
      hidden,
      selectedIds: [],
      focusedNodeId: null,
    });
    expect(a.expand).toEqual(["s1"]);
  });

  it("expands the owner of a focused or selected hidden node", () => {
    const base = { collapsedKey: "s1", hidden };
    expect(collapseGuardActions(m, base, { ...base, selectedIds: [], focusedNodeId: "vid1" }).expand).toEqual(["s1"]);
    expect(collapseGuardActions(m, base, { ...base, selectedIds: ["mp1"], focusedNodeId: null }).expand).toEqual(["s1"]);
  });

  it("does nothing when nothing changed", () => {
    const base = { collapsedKey: "s1", hidden };
    expect(collapseGuardActions(m, base, { ...base, selectedIds: ["s1"], focusedNodeId: "s1" })).toEqual({
      expand: [],
      deselect: [],
    });
  });
});

describe("withoutCollapsed", () => {
  it("strips the flag and keeps everything else", () => {
    expect(withoutCollapsed({ collapsed: true, order: 2 })).toEqual({ order: 2 });
  });
});
