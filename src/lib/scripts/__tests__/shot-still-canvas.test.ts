import { describe, expect, it } from "vitest";
import { shotOnScreen, shotStillNodes, stillInstruction, stillTitle } from "../shot-still-canvas";
import { locationNodeData, productNodeData } from "../asset-nodes";
import type { ScriptCanvasAssets } from "../asset-canvas";
import { PANEL_CARD, PANEL_GAP } from "../storyboard-canvas";

// D503 — Fan out's shot still: one Composite per panel, wired from the panel and the shot's picks.

const pouch = { id: "pouch", name: "Jackfruit365 pouch", images: [{ url: "https://x/p.png", source: "upload" as const }] };
const dining = { id: "dining", name: "Dining room", description: "", image: { url: "https://x/d.png", source: "upload" as const } };
const kitchen = { id: "kitchen", name: "Kitchen", description: "", image: { url: "https://x/k.png", source: "plate" as const } };
const assets: ScriptCanvasAssets = {
  scriptId: "sc1",
  products: [pouch],
  locations: [dining, kitchen],
  picks: { S1: { products: ["pouch"], location: "dining" }, S2: { products: [], location: "kitchen" } },
};
const panel = (id: string, title: string, x = 0, y = 300) => ({ id, type: "composite", position: { x, y }, data: { title, storyboardPanel: title.slice(0, 2) } });
const nodes = [
  panel("p1", "S1 · HOOK — storyboard"),
  panel("p2", "S2 · STEP — storyboard", 1000),
  { id: "a-h", type: "avatar", position: { x: 0, y: 0 }, data: { avatarId: "av-h" } },
  { id: "a-g", type: "avatar", position: { x: 0, y: 0 }, data: { avatarId: "av-g" } },
  { id: "prod", type: "product", position: { x: 0, y: 0 }, data: productNodeData("sc1", pouch) },
  { id: "loc", type: "location", position: { x: 0, y: 0 }, data: locationNodeData("sc1", dining) },
  { id: "plate", type: "composite", position: { x: 0, y: 0 }, data: { title: "Kitchen", scriptId: "sc1", scriptAsset: { kind: "location", id: "kitchen", name: "Kitchen", angle: 0 } } },
];
let n = 0;
const newId = () => `id${++n}`;
const run = (rows: { panels: { nodeId: string; label: string }[] }[], onScreen = {}) =>
  shotStillNodes({ rows, nodes, assets, onScreen, newId });

describe("shotOnScreen", () => {
  it("lists each shot's on-screen people who have an avatar, by row name", () => {
    const cast = [
      { id: "h", name: "Harpreet", description: "", avatarId: "11111111-1111-4111-8111-111111111111", isLead: true },
      { id: "d", name: "Daughter", description: "", avatarId: null, isLead: false },
    ];
    const shots = [{ onScreen: ["h", "d"] }, { onScreen: ["d"] }, { onScreen: [] }] as never;
    expect(shotOnScreen({ cast, shots })).toEqual({ S1: [{ avatarId: cast[0].avatarId, name: "Harpreet" }] });
  });
});

describe("stillInstruction and stillTitle", () => {
  it("names each input by its chip, leaving out what the shot does not have", () => {
    const storyboard = { id: "p", label: "Composite: S2 — storyboard" };
    expect(stillInstruction({ storyboard, avatars: [], location: null, products: [] })).toBe(
      "Using the storyboard @[Composite: S2 — storyboard](p), create the real scene.",
    );
    expect(
      stillInstruction({
        storyboard,
        avatars: [{ id: "a", label: "Avatar: A" }, { id: "b", label: "Avatar: B" }, { id: "c", label: "Avatar: C" }],
        location: { id: "l", label: "Location: L" },
        products: [{ id: "x", label: "Product: X" }, { id: "y", label: "Product: Y" }],
      }),
    ).toBe(
      "Using the storyboard @[Composite: S2 — storyboard](p), create the real scene using @[Avatar: A](a), @[Avatar: B](b) and @[Avatar: C](c), in the location @[Location: L](l), with the products @[Product: X](x) and @[Product: Y](y).",
    );
    expect(stillTitle("S1 · HOOK — storyboard")).toBe("S1 · HOOK — still");
  });
});

describe("shotStillNodes", () => {
  it("wires the panel, the on-screen avatars on the canvas, the location and the products, in that order", () => {
    const out = run([{ panels: [{ nodeId: "p1", label: "S1" }] }], {
      S1: [{ avatarId: "av-h", name: "Harpreet" }, { avatarId: "av-missing", name: "Gurmeet" }],
    });
    const [still] = out.nodes;
    expect(out.edges.map((e) => [e.source, e.target])).toEqual([["p1", still.id], ["a-h", still.id], ["loc", still.id], ["prod", still.id]]);
    // A Composite takes everything on its one handle.
    expect(out.edges.every((e) => e.targetHandle === undefined)).toBe(true);
    expect(still.data).toEqual({
      title: "S1 · HOOK — still",
      instruction:
        "Using the storyboard @[Composite: S1 · HOOK — storyboard](p1), create the real scene using @[Avatar: Harpreet](a-h), in the location @[Location: Dining room](loc), with the product @[Product: Jackfruit365 pouch](prod).",
    });
    expect(still.position).toEqual({ x: PANEL_CARD.width + PANEL_GAP, y: 300 });
  });

  it("labels a generated plate as the Composite it is", () => {
    const [still] = run([{ panels: [{ nodeId: "p2", label: "S2" }] }]).nodes;
    expect(still.data.instruction).toContain("in the location @[Composite: Kitchen](plate)");
  });

  it("puts a Multishot row's stills after its panels, in their order, and skips a panel that is gone", () => {
    const out = run([{ panels: [{ nodeId: "p1", label: "S1" }, { nodeId: "p2", label: "S2" }, { nodeId: "gone", label: "S3" }] }]);
    expect(out.nodes.map((s) => s.data.title)).toEqual(["S1 · HOOK — still", "S2 · STEP — still"]);
    const start = 1000 + PANEL_CARD.width + PANEL_GAP;
    expect(out.nodes.map((s) => s.position.x)).toEqual([start, start + PANEL_CARD.width + PANEL_GAP]);
    expect(out.rows).toEqual([{ stillIds: out.nodes.map((s) => s.id) }]);
  });
});
