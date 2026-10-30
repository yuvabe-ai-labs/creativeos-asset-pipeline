import { describe, it, expect } from "vitest";
import { scriptDocSchema, type ScriptDoc } from "../schema";
import { canvasAssetRows, scriptAssetCanvasNodes, scriptCanvasAssets } from "../asset-canvas";
import reel01 from "../fixtures/reel-01.json";

// D450 — products and locations on a canvas: frozen on the Script node, one node each at Fan out.

function doc(): ScriptDoc {
  const d = scriptDocSchema.parse(structuredClone(reel01));
  d.products = [
    { id: "pouch", name: "Brandname pouch", images: [{ url: "https://x/p0.png", source: "upload" }, { url: "https://x/p1.png", source: "upload" }] },
    { id: "jar", name: "Brandname jar", images: [] },
  ];
  d.locations = [{ id: "kitchen", name: "Home kitchen", description: "Teal walls.", image: { url: "https://x/k.png", source: "plate" } }];
  d.shots[0] = { ...d.shots[0], products: ["pouch"], location: "kitchen" };
  d.shots[1] = { ...d.shots[1], location: "kitchen" };
  d.shots[2] = { ...d.shots[2], products: ["pouch", "jar"] };
  return d;
}

let n = 0;
const newId = () => `id${++n}`;
const rows = [{ label: "S1" }, { label: "S2" }, { label: "S3" }];
const clip = (id: string, shotIndexes: number[]) => ({ id, data: { seededFrom: { scriptNodeId: "sc", shotIndexes } } });

describe("scriptCanvasAssets", () => {
  it("freezes the assets and each shot's picks by row name, and nothing for a script with none", () => {
    const a = scriptCanvasAssets("script-1", doc())!;
    expect(a.picks).toEqual({
      S1: { products: ["pouch"], location: "kitchen" },
      S2: { products: [], location: "kitchen" },
      S3: { products: ["pouch", "jar"], location: null },
    });
    expect(scriptCanvasAssets("script-1", scriptDocSchema.parse(structuredClone(reel01)))).toBeNull();
  });
});

describe("scriptAssetCanvasNodes", () => {
  const assets = scriptCanvasAssets("script-1", doc())!;

  it("makes one node per asset and wires it into every clip that uses it", () => {
    n = 0;
    const out = scriptAssetCanvasNodes({
      created: [clip("a", [0]), clip("b", [1]), clip("c", [2])],
      shots: rows, assets, existing: [], origin: { x: 0, y: 500 }, newId,
    });
    expect(out.nodes.map((x) => [x.type, x.data.name])).toEqual([
      ["location", "Home kitchen"], ["product", "Brandname pouch"], ["product", "Brandname jar"],
    ]);
    const kitchen = out.nodes[0].id;
    const pouch = out.nodes[1].id;
    expect(out.edges.filter((e) => e.source === kitchen).map((e) => e.target)).toEqual(["a", "b"]);
    expect(out.edges.filter((e) => e.source === pouch).map((e) => e.target)).toEqual(["a", "c"]);
    expect(out.edges.every((e) => e.targetHandle === "image")).toBe(true);
  });

  it("joins a multishot's shots into one set of wires", () => {
    const out = scriptAssetCanvasNodes({ created: [clip("m", [0, 1])], shots: rows, assets, existing: [], origin: { x: 0, y: 0 }, newId });
    expect(out.edges).toHaveLength(2);
  });

  it("reuses this script's node already on the canvas instead of adding a twin", () => {
    const existing = [{ id: "old-kitchen", type: "location", data: { scriptId: "script-1", locationId: "kitchen" } }];
    const out = scriptAssetCanvasNodes({ created: [clip("b", [1])], shots: rows, assets, existing, origin: { x: 0, y: 0 }, newId });
    expect(out.nodes).toEqual([]);
    expect(out.edges.map((e) => [e.source, e.target])).toEqual([["old-kitchen", "b"]]);
  });

  it("does nothing for a script that has no assets", () => {
    expect(scriptAssetCanvasNodes({ created: [clip("a", [0])], shots: rows, assets: undefined, existing: [], origin: { x: 0, y: 0 }, newId }))
      .toEqual({ nodes: [], edges: [] });
  });
});

describe("canvasAssetRows", () => {
  it("expands a node wired straight in, and those wired into the prompt node's shot", () => {
    const nodes = [
      { id: "mp", type: "multishot-prompt", data: {} },
      { id: "ms", type: "multishot", data: {} },
      { id: "kitchen", type: "location", data: { name: "Home kitchen", locationId: "kitchen", image: { url: "https://x/k.png" } } },
      { id: "pouch", type: "product", data: { name: "Brandname pouch", productId: "pouch", images: [{ url: "https://x/p0.png" }, { url: "https://x/p1.png" }] } },
    ];
    const edges = [
      { source: "ms", target: "mp" },
      { source: "kitchen", target: "ms" },
      { source: "pouch", target: "mp" },
    ];
    const out = canvasAssetRows("mp", nodes, edges);
    expect(out.direct.get("pouch")?.map((r) => [r.id, r.label])).toEqual([["pouch", "Brandname pouch"], ["pouch:1", "Brandname pouch, angle 2"]]);
    expect(out.viaShot.map((r) => [r.id, r.fileUrl])).toEqual([["kitchen", "https://x/k.png"]]);
  });
});
