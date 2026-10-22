import { describe, it, expect } from "vitest";
import { highlightedEdgeIds } from "./connection-focus";

// script → shot → prompt → video → dub, image → video, and d stands alone.
const nodes = ["script", "shot", "prompt", "image", "video", "dub", "d"].map((id) => ({ id }));
const edges = [
  { id: "s-sh", source: "script", target: "shot" },
  { id: "sh-p", source: "shot", target: "prompt" },
  { id: "p-v", source: "prompt", target: "video" },
  { id: "i-v", source: "image", target: "video" },
  { id: "v-d", source: "video", target: "dub" },
];
const select = (id: string) => nodes.map((n) => ({ ...n, selected: n.id === id }));
const sorted = (s: Set<string>) => [...s].sort();

describe("highlightedEdgeIds", () => {
  it("highlights nothing when nothing is selected", () => {
    expect(highlightedEdgeIds(nodes, edges).size).toBe(0);
  });

  it("a selected node lights its whole upstream chain and its own outgoing lines", () => {
    expect(sorted(highlightedEdgeIds(select("video"), edges))).toEqual(["i-v", "p-v", "s-sh", "sh-p", "v-d"]);
  });

  it("does not light other branches downstream of an ancestor", () => {
    const withSibling = [...edges, { id: "sh-x", source: "shot", target: "x" }];
    expect(highlightedEdgeIds(select("video"), withSibling).has("sh-x")).toBe(false);
  });

  it("a selected connection highlights only itself", () => {
    const ids = highlightedEdgeIds(nodes, edges.map((e) => ({ ...e, selected: e.id === "p-v" })));
    expect([...ids]).toEqual(["p-v"]);
  });

  it("a selected node with no connections highlights nothing", () => {
    expect(highlightedEdgeIds(select("d"), edges).size).toBe(0);
  });

  it("survives a cycle", () => {
    const cyclic = [
      { id: "ab", source: "a", target: "b" },
      { id: "ba", source: "b", target: "a" },
    ];
    expect(sorted(highlightedEdgeIds([{ id: "a", selected: true }, { id: "b" }], cyclic))).toEqual(["ab", "ba"]);
  });
});
