import type { Edge, XYPosition } from "@xyflow/react";
import type { ReelShot } from "@/lib/nodes/reel-script";
import type { Product, ScriptDoc, ScriptLocation } from "./schema";
import { shotLabel } from "./storyboard";
import { ASSET_CARD, ASSET_GAP } from "./storyboard-canvas";
import type { ScriptPlateRequest } from "./script-composites";
import {
  isScriptAssetNode,
  locationNodeData,
  productNodeData,
  scriptAssetRows,
  scriptAssetTagOf,
  storyboardPanelName,
  storyboardPanelOf,
  type LocationNodeData,
  type ProductNodeData,
} from "./asset-nodes";

// D450 — a script's products and locations on a canvas: frozen onto the Script node when it is
// added (like its storyboard, D381/D385), made into ONE node each by Fan out, and wired into every
// new Shot/Multishot that uses them — so a shared set is one node with a line into each clip.
// D456 — a location whose plate the script page generated is a Composite instead, made on the
// server with that generation as v1 (script-composites), like a storyboard panel.

/** What the Script node carries: the script's assets and each shot's picks, keyed by the shot's
 *  row name ("S3"), which is how a fanned-out node finds its script shots (D380). */
export type ScriptCanvasAssets = {
  scriptId: string;
  products: Product[];
  locations: ScriptLocation[];
  picks: Record<string, { products: string[]; location: string | null }>;
};

/** The assets to freeze onto a Script node, or null when the script has none. */
export function scriptCanvasAssets(scriptId: string, doc: ScriptDoc): ScriptCanvasAssets | null {
  if (doc.products.length === 0 && doc.locations.length === 0) return null;
  const picks: ScriptCanvasAssets["picks"] = {};
  doc.shots.forEach((s, i) => {
    if (s.products.length > 0 || s.location) picks[shotLabel(i)] = { products: s.products, location: s.location };
  });
  return { scriptId, products: doc.products, locations: doc.locations, picks };
}

const nameKey = (label: string) => label.trim().toUpperCase();

type Seeded = { id: string; data: unknown };
type AssetNode =
  | { id: string; type: "product"; position: XYPosition; data: ProductNodeData }
  | { id: string; type: "location"; position: XYPosition; data: LocationNodeData };

/** Pixel size the asset column steps by before anything is measured (D460: the estimate the column
 *  settles from, so the first frame never overlaps either). */
const ASSET_PITCH = ASSET_CARD.height + ASSET_GAP;

/**
 * Fan out's asset nodes: one per product and location any new clip uses, reusing one already on
 * the canvas for this script (a second Fan out wires into it rather than adding a twin), and an
 * edge into each clip's `image` handle per pick. Placed in a column under the Script node. A
 * generated plate comes back as a request, not a node: the server makes its Composite, and its
 * edges are added once it exists.
 */
export function scriptAssetCanvasNodes(args: {
  created: Seeded[];
  shots: Pick<ReelShot, "label">[];
  assets: ScriptCanvasAssets | undefined;
  existing: Array<{ id: string; type?: string; data: unknown }>;
  origin: XYPosition;
  newId: () => string;
}): { nodes: AssetNode[]; plates: ScriptPlateRequest[]; edges: Edge[] } {
  const { created, shots, assets, existing, origin, newId } = args;
  if (!assets) return { nodes: [], plates: [], edges: [] };

  const keyOf = (kind: "product" | "location", id: string) => `${kind}:${id}`;
  const onCanvas = new Map<string, string>();
  for (const n of existing) {
    const data = n.data as Record<string, unknown>;
    if (!isScriptAssetNode({ type: n.type ?? "", data }) || data.scriptId !== assets.scriptId) continue;
    if (n.type === "composite") {
      const tag = scriptAssetTagOf(data);
      if (tag) onCanvas.set(keyOf("location", tag.id), n.id);
      continue;
    }
    const d = data as Partial<ProductNodeData & LocationNodeData>;
    const id = n.type === "product" ? d.productId : d.locationId;
    if (id) onCanvas.set(keyOf(n.type as "product" | "location", id), n.id);
  }

  const nodes: AssetNode[] = [];
  const plates: ScriptPlateRequest[] = [];
  const edges: Edge[] = [];
  const nodeFor = (kind: "product" | "location", id: string): string | null => {
    const key = keyOf(kind, id);
    const known = onCanvas.get(key);
    if (known) return known;
    const position = { x: origin.x, y: origin.y + (nodes.length + plates.length) * ASSET_PITCH };
    const made = newId();
    if (kind === "product") {
      const p = assets.products.find((x) => x.id === id);
      if (!p) return null;
      nodes.push({ id: made, type: "product", position, data: productNodeData(assets.scriptId, p) });
    } else {
      const l = assets.locations.find((x) => x.id === id);
      if (!l) return null;
      // D456 — a generated plate: the server makes its Composite.
      if (l.image?.source === "plate") plates.push({ nodeId: made, locationId: l.id, position });
      else nodes.push({ id: made, type: "location", position, data: locationNodeData(assets.scriptId, l) });
    }
    onCanvas.set(key, made);
    return made;
  };

  for (const clip of created) {
    const indexes = (clip.data as { seededFrom?: { shotIndexes?: number[] } }).seededFrom?.shotIndexes ?? [];
    const wanted = new Set<string>();
    for (const i of indexes) {
      const label = shots[i]?.label;
      const picks = label ? assets.picks[nameKey(label)] : undefined;
      if (!picks) continue;
      // The place first, then the products in the order the shot lists them.
      if (picks.location) wanted.add(keyOf("location", picks.location));
      for (const p of picks.products) wanted.add(keyOf("product", p));
    }
    for (const key of wanted) {
      const [kind, id] = key.split(/:(.*)/s) as ["product" | "location", string];
      const source = nodeFor(kind, id);
      if (source) edges.push({ id: newId(), source, target: clip.id, targetHandle: "image" });
    }
  }
  return { nodes, plates, edges };
}

/** What the browser needs to show a prompt node's pictures. */
export type AssetUpstreamRow = { id: string; label: string; type: "file"; fileUrl: string; fileKind: "image" };

type CanvasNodeLike = { id: string; type?: string; data: unknown };

/** A canvas node as the server reads it: a Composite's picture is display-hydrated onto
 *  `data.parsed` (D19), the server's activeOutput. */
function asUpstream(n: CanvasNodeLike) {
  const data = n.data as Record<string, unknown>;
  return { nodeId: n.id, type: n.type ?? "", data, activeOutput: data.parsed };
}

const isAsset = (n: CanvasNodeLike) => isScriptAssetNode(asUpstream(n));

function rowsOf(node: CanvasNodeLike): AssetUpstreamRow[] {
  return scriptAssetRows(asUpstream(node)).map((r) => {
    const tag = r.data.scriptAsset as { name: string; angle: number };
    return {
      id: r.nodeId,
      label: tag.angle > 0 ? `${tag.name}, angle ${tag.angle + 1}` : tag.name,
      type: "file",
      fileUrl: String(r.data.fileUrl),
      fileKind: "image",
    };
  });
}

/** D454 — a storyboard Composite on the canvas: its current picture is display-hydrated onto
 *  `data.parsed` (D19), the server's activeOutput. */
function canvasPanelOf(n: { type?: string; data: unknown }) {
  const data = n.data as Record<string, unknown>;
  return storyboardPanelOf({ type: n.type ?? "", data }, data.parsed);
}

/**
 * D450 — the browser's half of getPromptUpstream's expansion, from the canvas store: a Product or
 * Location node wired straight into the prompt node, in its place; then those wired into the
 * prompt node's Shot/Multishot. Same rows, ids and order as the server, so numbering agrees.
 */
export function canvasAssetRows(
  promptNodeId: string,
  nodes: Array<{ id: string; type?: string; data: unknown }>,
  edges: Array<{ source: string; target: string }>,
): { direct: Map<string, AssetUpstreamRow[]>; viaShot: AssetUpstreamRow[]; panels: AssetUpstreamRow[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  type CanvasNode = (typeof nodes)[number];
  const into = (target: string): CanvasNode[] =>
    edges.filter((e) => e.target === target).map((e) => byId.get(e.source)).filter((n): n is CanvasNode => n !== undefined);
  const direct = new Map<string, AssetUpstreamRow[]>();
  const viaShot: AssetUpstreamRow[] = [];
  const panels: AssetUpstreamRow[] = [];
  for (const source of into(promptNodeId)) {
    if (isAsset(source)) direct.set(source.id, rowsOf(source));
    if (source.type === "shot" || source.type === "multishot") {
      for (const asset of into(source.id)) {
        if (isAsset(asset)) viaShot.push(...rowsOf(asset));
        // D452 — the shot's storyboard panels, after every real picture (as getPromptUpstream).
        const panel = canvasPanelOf(asset);
        if (panel) panels.push({ id: asset.id, label: storyboardPanelName(panel), type: "file", fileUrl: panel.url, fileKind: "image" });
      }
    }
  }
  // D453 — panels separately: the caller puts them after the presenter, as getPromptUpstream does.
  return { direct, viaShot, panels };
}

/** A script asset reaching a focus view through the clip's Shot or Multishot. */
export type ShotAssetEntry = {
  nodeId: string;
  kind: "product" | "location" | "storyboard";
  name: string;
  /** The main picture or the plate; null while the script had none. */
  url: string | null;
  pictures: number;
};

const PROMPT_TYPES = new Set(["prompt", "video-prompt", "multishot-prompt"]);

/**
 * D450 — the Product / Location nodes wired into the Shot or Multishot that feeds `nodeId`: straight
 * in (a prompt node), or through its prompt node (a gen node). What the focus views list under
 * "From the shot"; the same images the server sends.
 */
export function shotAssetEntries(
  nodeId: string,
  nodes: Array<{ id: string; type?: string; data: unknown }>,
  edges: Array<{ source: string; target: string }>,
): ShotAssetEntry[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  type CanvasNode = (typeof nodes)[number];
  const sources = (id: string): CanvasNode[] =>
    edges.filter((e) => e.target === id).map((e) => byId.get(e.source)).filter((n): n is CanvasNode => n !== undefined);
  const direct = sources(nodeId);
  const viaPrompt = direct.filter((n) => PROMPT_TYPES.has(n.type ?? "")).flatMap((p) => sources(p.id));
  const shots = [...direct, ...viaPrompt].filter((n) => n.type === "shot" || n.type === "multishot");
  const out: ShotAssetEntry[] = [];
  const panels: ShotAssetEntry[] = [];
  for (const shot of shots) {
    for (const n of sources(shot.id)) {
      const panel = canvasPanelOf(n);
      if (panel && !panels.some((p) => p.nodeId === n.id)) {
        panels.push({ nodeId: n.id, kind: "storyboard", name: storyboardPanelName(panel), url: panel.url, pictures: 1 });
      }
      if (!isAsset(n) || out.some((o) => o.nodeId === n.id)) continue;
      // D456 — a generated plate's Composite: the location, its current picture.
      if (n.type === "composite") {
        const tag = scriptAssetTagOf(n.data as Record<string, unknown>)!;
        const [plate] = rowsOf(n);
        out.push({ nodeId: n.id, kind: "location", name: tag.name, url: plate?.fileUrl ?? null, pictures: plate ? 1 : 0 });
        continue;
      }
      const d = n.data as Partial<ProductNodeData & LocationNodeData>;
      const images = n.type === "product" ? d.images ?? [] : d.image ? [d.image] : [];
      out.push({ nodeId: n.id, kind: n.type as "product" | "location", name: d.name ?? n.type ?? "", url: images[0]?.url ?? null, pictures: images.length });
    }
  }
  return [...out, ...panels];
}
