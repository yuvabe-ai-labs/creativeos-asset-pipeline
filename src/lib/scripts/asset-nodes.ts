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

/** D456 — a location plate the script page generated arrives as a Composite (its generation as v1,
 *  like a storyboard panel), marked as the script's location. */
export type LocationCompositeMark = { scriptId: string; scriptAsset: ScriptAssetTag };

/** A script's product or location on the canvas: a Product or Location node, or a generated plate's
 *  Composite. The rows it expands to carry no `scriptId`, so expanding twice changes nothing. */
export function isScriptAssetNode(node: Pick<UpstreamOutput, "type" | "data">): boolean {
  if (isScriptAssetNodeType(node.type)) return true;
  return node.type === "composite" && typeof node.data.scriptId === "string" && scriptAssetTagOf(node.data)?.kind === "location";
}

/** What a row says it is: read by the reference ranking and the roles line. D452 — "storyboard" is
 *  a panel wired into the clip's Shot or Multishot; D454 — a Composite, "still" once made real. */
export type ScriptAssetTag = { kind: ScriptAssetNodeType | "storyboard" | "still"; id: string; name: string; angle: number };

const TAG_KINDS: readonly ScriptAssetTag["kind"][] = ["product", "location", "storyboard", "still"];

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
  if (!tag || !tag.kind || !TAG_KINDS.includes(tag.kind) || typeof tag.name !== "string") return null;
  return { kind: tag.kind, id: String(tag.id ?? ""), name: tag.name, angle: typeof tag.angle === "number" ? tag.angle : 0 };
}

const LOCATION_TEXT = (name: string) =>
  `${name}, the location: the place this shot happens in, shown empty. Set the shot there; never copy its emptiness.`;

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
 * writer still reads the shot's own text. D456 — a generated plate's Composite is its current
 * picture: `activeOutput` on the server, `data.parsed` in the browser.
 */
export function scriptAssetRows(node: Pick<UpstreamOutput, "nodeId" | "type" | "data"> & { activeOutput?: unknown }): UpstreamOutput[] {
  if (node.type === "composite") {
    const tag = isScriptAssetNode(node) ? scriptAssetTagOf(node.data) : null;
    if (!tag || typeof node.activeOutput !== "string" || !node.activeOutput) return [];
    return [row(node.nodeId, node.activeOutput, { ...tag, angle: 0 }, LOCATION_TEXT(tag.name))];
  }
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
    return [row(node.nodeId, d.image.url, { kind: "location", id: d.locationId ?? "", name, angle: 0 }, LOCATION_TEXT(name))];
  }
  return [];
}

/** D454 — what Fan out puts on a storyboard Composite: the shot it draws, and the approved sketch
 *  it starts from (its first version). */
export type StoryboardCompositeData = { storyboardPanel: string; storyboardSketchUrl: string };

/**
 * D454 — a Shot/Multishot's storyboard: the Composite Fan out wires into it, and what it shows now.
 * `sketch` while its picture is still the approved sketch; once the operator has made it real
 * (wired an avatar or product and edited it), it is the shot's approved still. `output` is the
 * Composite's current picture: the active version on the server, `data.parsed` in the browser.
 * Null for any other node, and for a Composite with no picture.
 */
export function storyboardPanelOf(
  node: Pick<UpstreamOutput, "type" | "data">,
  output: unknown,
): { label: string; url: string; sketch: boolean } | null {
  const d = node.data as Partial<StoryboardCompositeData>;
  if (node.type !== "composite" || typeof d.storyboardPanel !== "string" || !d.storyboardPanel) return null;
  if (typeof output !== "string" || !output) return null;
  return { label: d.storyboardPanel, url: output, sketch: output === d.storyboardSketchUrl };
}

/** "S3 storyboard" while it is the sketch, "S3 still" once it has been made real. */
export const storyboardPanelName = (p: { label: string; sketch: boolean }) => `${p.label} ${p.sketch ? "storyboard" : "still"}`;

/**
 * D452 — a storyboard panel as a reference row. The sketch: a guide to the shot's composition,
 * staging and framing, ranked after every real reference and told it is a placeholder drawing.
 * D454 — made real, it is the shot's approved still: a real picture to match, ranked with the
 * script's main pictures.
 */
export function storyboardPanelRow(node: Pick<UpstreamOutput, "nodeId" | "type" | "data" | "activeOutput">): UpstreamOutput | null {
  const panel = storyboardPanelOf(node, node.activeOutput);
  if (!panel) return null;
  const tag: ScriptAssetTag = { kind: panel.sketch ? "storyboard" : "still", id: panel.label, name: storyboardPanelName(panel), angle: 0 };
  return row(node.nodeId, panel.url, tag, panel.sketch
    ? `The ${panel.label} storyboard panel: a rough sketch of this shot's composition, staging and camera framing. ` +
      "Follow its layout; its people and objects are placeholders for the other references. Never describe or copy the drawing style."
    : `The ${panel.label} still: the approved picture of this shot. Match its moment, people, products, place and framing.`);
}

/** Every row in `rows`, with each script product or location node expanded in its place. */
export function withScriptAssetImages<T extends Pick<UpstreamOutput, "nodeId" | "type" | "data"> & { activeOutput?: unknown }>(rows: T[]): (T | UpstreamOutput)[] {
  return rows.flatMap((r): (T | UpstreamOutput)[] => (isScriptAssetNode(r) ? scriptAssetRows(r) : [r]));
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
    // D454 — a storyboard made real ranks with the main pictures.
    else (tag.angle === 0 ? main : angles).push(r.nodeId);
  }
  return { main, angles, storyboard };
}
