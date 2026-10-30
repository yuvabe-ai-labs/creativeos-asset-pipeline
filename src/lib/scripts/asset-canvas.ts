import type { Edge, XYPosition } from "@xyflow/react";
import type { ReelShot } from "@/lib/nodes/reel-script";
import type { Product, ScriptDoc, ScriptLocation } from "./schema";
import { shotLabel } from "./storyboard";
import {
  isScriptAssetNodeType,
  locationNodeData,
  productNodeData,
  scriptAssetRows,
  type LocationNodeData,
  type ProductNodeData,
} from "./asset-nodes";

// D450 — a script's products and locations on a canvas: frozen onto the Script node when it is
// added (like its storyboard, D381/D385), made into ONE node each by Fan out, and wired into every
// new Shot/Multishot that uses them — so a shared set is one node with a line into each clip.

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

/** Pixel size the asset column steps by. */
const ASSET_PITCH = 300;

/**
 * Fan out's asset nodes: one per product and location any new clip uses, reusing one already on
 * the canvas for this script (a second Fan out wires into it rather than adding a twin), and an
 * edge into each clip's `image` handle per pick. Placed in a column under the Script node.
 */
export function scriptAssetCanvasNodes(args: {
  created: Seeded[];
  shots: Pick<ReelShot, "label">[];
  assets: ScriptCanvasAssets | undefined;
  existing: Array<{ id: string; type?: string; data: unknown }>;
  origin: XYPosition;
  newId: () => string;
}): { nodes: AssetNode[]; edges: Edge[] } {
  const { created, shots, assets, existing, origin, newId } = args;
  if (!assets) return { nodes: [], edges: [] };

  const keyOf = (kind: "product" | "location", id: string) => `${kind}:${id}`;
  const onCanvas = new Map<string, string>();
  for (const n of existing) {
    if (!n.type || !isScriptAssetNodeType(n.type)) continue;
    const d = n.data as Partial<ProductNodeData & LocationNodeData>;
    if (d.scriptId !== assets.scriptId) continue;
    const id = n.type === "product" ? d.productId : d.locationId;
    if (id) onCanvas.set(keyOf(n.type, id), n.id);
  }

  const nodes: AssetNode[] = [];
  const edges: Edge[] = [];
  const nodeFor = (kind: "product" | "location", id: string): string | null => {
    const key = keyOf(kind, id);
    const known = onCanvas.get(key);
    if (known) return known;
    const position = { x: origin.x, y: origin.y + nodes.length * ASSET_PITCH };
    if (kind === "product") {
      const p = assets.products.find((x) => x.id === id);
      if (!p) return null;
      nodes.push({ id: newId(), type: "product", position, data: productNodeData(assets.scriptId, p) });
    } else {
      const l = assets.locations.find((x) => x.id === id);
      if (!l) return null;
      nodes.push({ id: newId(), type: "location", position, data: locationNodeData(assets.scriptId, l) });
    }
    const made = nodes[nodes.length - 1].id;
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
  return { nodes, edges };
}

/** What the browser needs to show a prompt node's pictures. */
export type AssetUpstreamRow = { id: string; label: string; type: "file"; fileUrl: string; fileKind: "image" };

function rowsOf(node: { id: string; type?: string; data: unknown }): AssetUpstreamRow[] {
  return scriptAssetRows({ nodeId: node.id, type: node.type ?? "", data: node.data as Record<string, unknown> }).map((r) => {
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

/**
 * D450 — the browser's half of getPromptUpstream's expansion, from the canvas store: a Product or
 * Location node wired straight into the prompt node, in its place; then those wired into the
 * prompt node's Shot/Multishot. Same rows, ids and order as the server, so numbering agrees.
 */
export function canvasAssetRows(
  promptNodeId: string,
  nodes: Array<{ id: string; type?: string; data: unknown }>,
  edges: Array<{ source: string; target: string }>,
): { direct: Map<string, AssetUpstreamRow[]>; viaShot: AssetUpstreamRow[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  type CanvasNode = (typeof nodes)[number];
  const into = (target: string): CanvasNode[] =>
    edges.filter((e) => e.target === target).map((e) => byId.get(e.source)).filter((n): n is CanvasNode => n !== undefined);
  const direct = new Map<string, AssetUpstreamRow[]>();
  const viaShot: AssetUpstreamRow[] = [];
  for (const source of into(promptNodeId)) {
    if (source.type && isScriptAssetNodeType(source.type)) direct.set(source.id, rowsOf(source));
    if (source.type === "shot" || source.type === "multishot") {
      for (const asset of into(source.id)) {
        if (asset.type && isScriptAssetNodeType(asset.type)) viaShot.push(...rowsOf(asset));
      }
    }
  }
  return { direct, viaShot };
}
