import type { UpstreamOutput } from "@/lib/db/nodes";
import type { Product, ScriptImage, ScriptLocation } from "./schema";

// D450 — a script's products and locations on the canvas. Each is ONE node for the canvas, wired
// into every Shot/Multishot that uses it, holding the script's data as it was when the script was
// added (like the frozen storyboard, D381/D385). Like an Avatar node (D436) it is a set of
// pictures: wherever its pictures are read, it becomes image rows — main packshot first, then
// angles; a location, its plate — each tagged with what it is so the video request can say so.

export type ProductNodeData = {
  scriptId: string;
  productId: string;
  name: string;
  images: ScriptImage[];
};

export type LocationNodeData = {
  scriptId: string;
  locationId: string;
  name: string;
  description: string;
  image: ScriptImage | null;
};

export const SCRIPT_ASSET_NODE_TYPES = ["product", "location"] as const;
export type ScriptAssetNodeType = (typeof SCRIPT_ASSET_NODE_TYPES)[number];

export function isScriptAssetNodeType(type: string): type is ScriptAssetNodeType {
  return (SCRIPT_ASSET_NODE_TYPES as readonly string[]).includes(type);
}

/** What a row says it is: read by the reference ranking and the roles line. D452 — "storyboard" is
 *  a panel wired into the clip's Shot or Multishot (a File node, not a node type of its own). */
export type ScriptAssetTag = { kind: ScriptAssetNodeType | "storyboard"; id: string; name: string; angle: number };

export function productNodeData(scriptId: string, p: Product): ProductNodeData {
  return { scriptId, productId: p.id, name: p.name, images: p.images };
}

export function locationNodeData(scriptId: string, l: ScriptLocation): LocationNodeData {
  return { scriptId, locationId: l.id, name: l.name, description: l.description, image: l.image };
}

/** The row id of one picture: the node's own id for the main one (so a cited or switched-off
 *  image keeps its id when angles are added), `{nodeId}:{n}` for angle n. */
export const scriptAssetRowId = (nodeId: string, angle: number) => (angle === 0 ? nodeId : `${nodeId}:${angle}`);

/** The tag on an upstream row, or null when the row is not a script asset's picture. */
export function scriptAssetTagOf(data: Record<string, unknown>): ScriptAssetTag | null {
  const tag = data.scriptAsset as Partial<ScriptAssetTag> | undefined;
  if (!tag || (tag.kind !== "product" && tag.kind !== "location" && tag.kind !== "storyboard") || typeof tag.name !== "string") return null;
  return { kind: tag.kind, id: String(tag.id ?? ""), name: tag.name, angle: typeof tag.angle === "number" ? tag.angle : 0 };
}

function row(nodeId: string, url: string, tag: ScriptAssetTag, text: string): UpstreamOutput {
  return {
    nodeId: scriptAssetRowId(nodeId, tag.angle),
    type: "file",
    data: { scriptAsset: tag, title: tag.name, fileKind: "image", fileUrl: url, processedOutput: text },
    activeOutput: null,
    versionId: null,
  };
}

/**
 * One Product or Location node as the image rows every reader already handles (File rows, as the
 * presenter's are). A node with no picture yet becomes no rows: there is nothing to send, and the
 * writer still reads the shot's own text.
 */
export function scriptAssetRows(node: Pick<UpstreamOutput, "nodeId" | "type" | "data">): UpstreamOutput[] {
  if (node.type === "product") {
    const d = node.data as Partial<ProductNodeData>;
    const name = d.name ?? "the product";
    return (d.images ?? []).map((img, angle) =>
      row(node.nodeId, img.url, { kind: "product", id: d.productId ?? "", name, angle },
        angle === 0
          ? `${name}, the product: copy it exactly as pictured, never its backdrop.`
          : `${name}, another angle of the same product.`));
  }
  if (node.type === "location") {
    const d = node.data as Partial<LocationNodeData>;
    if (!d.image) return [];
    const name = d.name ?? "the location";
    return [row(node.nodeId, d.image.url, { kind: "location", id: d.locationId ?? "", name, angle: 0 },
      `${name}, the location: the place this shot happens in, shown empty. Set the shot there; never copy its emptiness.`)];
  }
  return [];
}

/**
 * D452 — the shot's storyboard label when `node` is one of its panels: the File node Fan out wires
 * into a Shot/Multishot (marked `storyboardPanel` since D452; before that, recognised by the
 * "S3-storyboard.jpg" name Fan out gives it). Null for any other picture.
 */
export function storyboardPanelLabel(node: Pick<UpstreamOutput, "type" | "data">): string | null {
  if (node.type !== "file" || node.data.fileKind !== "image" || typeof node.data.fileUrl !== "string") return null;
  if (typeof node.data.storyboardPanel === "string" && node.data.storyboardPanel) return node.data.storyboardPanel;
  const m = typeof node.data.filename === "string" ? node.data.filename.match(/^(S\d+)-storyboard\.[a-z0-9]+$/i) : null;
  return m ? m[1].toUpperCase() : null;
}

/**
 * D452 — a storyboard panel as a reference row: a sketch of the shot's composition, staging and
 * framing. Never a first frame (a first frame sets the clip's look, and this is a drawing); ranked
 * after every real reference; and told it is a placeholder drawing (the roles line says so).
 */
export function storyboardPanelRow(node: Pick<UpstreamOutput, "nodeId" | "type" | "data">): UpstreamOutput | null {
  const label = storyboardPanelLabel(node);
  if (!label) return null;
  return row(node.nodeId, String(node.data.fileUrl), { kind: "storyboard", id: label, name: `${label} storyboard`, angle: 0 },
    `The ${label} storyboard panel: a rough sketch of this shot's composition, staging and camera framing. ` +
      "Follow its layout; its people and objects are placeholders for the other references. Never describe or copy the drawing style.");
}

/** Every row in `rows`, with each Product / Location node expanded in its place. */
export function withScriptAssetImages<T extends Pick<UpstreamOutput, "nodeId" | "type" | "data">>(rows: T[]): (T | UpstreamOutput)[] {
  return rows.flatMap((r): (T | UpstreamOutput)[] => (isScriptAssetNodeType(r.type) ? scriptAssetRows(r) : [r]));
}

/** D450 — the ids of a script's main pictures (packshots, plates) and of its other angles among
 *  `rows`, for the reference ranking (selectReferences' assetMainIds / assetAngleIds). */
export function scriptAssetIds(rows: Array<Pick<UpstreamOutput, "nodeId" | "data">>): { main: string[]; angles: string[]; storyboard: string[] } {
  const main: string[] = [];
  const angles: string[] = [];
  const storyboard: string[] = [];
  for (const r of rows) {
    const tag = scriptAssetTagOf(r.data);
    if (!tag) continue;
    if (tag.kind === "storyboard") storyboard.push(r.nodeId);
    else (tag.angle === 0 ? main : angles).push(r.nodeId);
  }
  return { main, angles, storyboard };
}
