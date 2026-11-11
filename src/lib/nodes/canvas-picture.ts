import { isGeneratedImageType } from "./image-node-types";
import type { LocationNodeData, ProductNodeData } from "@/lib/scripts/asset-nodes";

/**
 * The picture a canvas node shows, as an input row's `fileUrl` / `fileKind`: a File or Sketch its
 * own upload, a generated image its active output (hydrated into `data.parsed`, D19), and a
 * script's Product or Location (D450) its packshot or plate. Every node that lists its inputs reads
 * this, so a new picture-carrying node is one case here, not one in every node file: products and
 * locations were missing from all of them, and their previews read "no preview".
 */
export function canvasPicture(
  type: string | null | undefined,
  data: Record<string, unknown>,
): { fileUrl?: string; fileKind?: string } {
  if (type === "file" || type === "draw") {
    return { fileUrl: data.fileUrl as string | undefined, fileKind: data.fileKind as string | undefined };
  }
  if (isGeneratedImageType(type)) {
    return typeof data.parsed === "string" && data.parsed ? { fileUrl: data.parsed, fileKind: "image" } : { fileKind: "image" };
  }
  if (type === "product") {
    const url = (data as Partial<ProductNodeData>).images?.[0]?.url;
    return url ? { fileUrl: url, fileKind: "image" } : {};
  }
  if (type === "location") {
    const url = (data as Partial<LocationNodeData>).image?.url;
    return url ? { fileUrl: url, fileKind: "image" } : {};
  }
  return {};
}

/** A canvas node's own name for an input row: its title, or a Product / Location's name. */
export function canvasNodeName(data: Record<string, unknown>): string | undefined {
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (title) return title;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  return name || undefined;
}

type PreviewRow = { nodeId: string; label: string; type: string; text: string; fileUrl?: string; fileKind?: string; useLlm?: boolean };
type RailRow = { id: string; label: string; type: string; fileUrl?: string; fileKind?: string };

/**
 * The read-only preview of the rail item `selected`: the server's resolved row (compile-preview)
 * when it has one, else the canvas row's own picture, so an input the server's answer does not
 * carry yet (it predates the wire, or failed) still shows its image instead of "no preview".
 * Null when neither has anything to show.
 */
export function selectedInputPreview(
  connected: readonly PreviewRow[],
  upstream: readonly RailRow[],
  selected: string,
): PreviewRow | null {
  const server = connected.find((c) => c.nodeId === selected);
  if (server) return server;
  const canvas = upstream.find((u) => u.id === selected);
  if (!canvas?.fileUrl) return null;
  return { nodeId: canvas.id, label: canvas.label, type: canvas.type, text: "", fileUrl: canvas.fileUrl, fileKind: canvas.fileKind };
}
