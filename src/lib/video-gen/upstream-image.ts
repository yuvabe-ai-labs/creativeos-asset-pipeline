import { isGeneratedImageType } from "@/lib/nodes/image-node-types";
import { scriptAssetTagOf } from "@/lib/scripts/asset-nodes";
import type { UpstreamImage } from "./api";

/** One node's row in a Video Gen's input list, or null when it is not a ready image. Shared by the
 *  upstream-images route and the view's instant row on an add (D482), so what appears on the click
 *  is what the confirming read returns. Avatars, products and prompt nodes come back null: only the
 *  server can expand them, so an add of one shows a loading row instead. */
export function upstreamImageOf(u: {
  nodeId: string;
  type: string;
  data: Record<string, unknown>;
  activeOutput: unknown;
}): (UpstreamImage & { fileSizeBytes?: number; imageWidth?: number; imageHeight?: number }) | null {
  const d = u.data;
  let imageUrl: string | null = null;
  if (u.type === "file" || u.type === "draw") {
    if (d.fileKind === "image" && typeof d.fileUrl === "string") imageUrl = d.fileUrl;
  } else if (isGeneratedImageType(u.type) && typeof u.activeOutput === "string") {
    imageUrl = u.activeOutput;
  }
  if (imageUrl === null) return null;

  // D450 — a script's product or location picture goes by its name ("Chupps, angle 2").
  const tag = scriptAssetTagOf(d);
  return {
    id: u.nodeId,
    type: u.type,
    imageUrl,
    filename: tag
      ? tag.angle > 0 ? `${tag.name}, angle ${tag.angle + 1}` : tag.name
      : typeof d.filename === "string" ? d.filename : undefined,
    ...(tag && (tag.kind === "product" || tag.kind === "location") ? { asset: { kind: tag.kind, nodeId: u.nodeId.replace(/:\d+$/, ""), angle: tag.angle } } : {}),
    fileSizeBytes: d.fileSizeBytes as number | undefined,
    imageWidth: d.imageWidth as number | undefined,
    imageHeight: d.imageHeight as number | undefined,
  };
}
