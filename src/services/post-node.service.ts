// src/services/post-node.service.ts
import type Konva from "konva";
import type { PostFormat } from "@/lib/post/types";
import { POST_FORMATS } from "@/lib/post/formats";
import { fileNodeService } from "./file-node.service";

export function buildExportFilename(title: string, format: PostFormat): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${slug || "untitled-post"}-${format}.png`;
}

export type ExportResult = {
  fileUrl: string;
  filename: string;
  imageWidth: number;
  imageHeight: number;
  fileSizeBytes: number;
  renderedAt: string;
};

// ExportResult plus the one out-of-band signal the caller needs but must NOT persist
// onto the node (it is a property of this run, not of the render).
export type ExportRenderResult = ExportResult & { downscaled: boolean };

// Does the failure mean "the file was too big to upload"? Both the client-side guard in
// fileNodeService.upload and the /file/sign route phrase it as an "exceed(s) … limit"
// message; matching on that keeps the fallback below scoped to the one real cause
// instead of retrying every network blip.
function isUploadSizeFailure(e: unknown): boolean {
  const message = e instanceof Error ? e.message : "";
  return /exceed/i.test(message) && /limit/i.test(message);
}

// Renders the SAME Konva Stage instance the editor shows — at the format's full native
// pixel size regardless of the on-screen (possibly scaled-down) stage — then uploads via
// the existing File-node upload path (reused, not reimplemented). `stage`'s on-screen
// size is `containerW`/`containerH` (Task 20); `pixelRatio` scales that up to the
// format's real dimensions in one step.
export async function exportRender(
  nodeId: string,
  stage: Konva.Stage,
  format: PostFormat,
  title: string,
): Promise<ExportRenderResult> {
  const spec = POST_FORMATS[format];
  const pixelRatio = spec.width / stage.width();
  const filename = buildExportFilename(title, format);

  try {
    return { ...(await rasterizeAndUpload(nodeId, stage, filename, pixelRatio)), downscaled: false };
  } catch (e) {
    // A4 at 300 DPI is 2480x3508 — a photographic PNG at that size routinely blows past
    // FILE_NODE_MAX_SIZE (10 MB), and the operator never chose the byte size. Retry ONCE
    // at half the pixel ratio (~150 DPI, the mitigation the design spec already called
    // for) and let the caller say so. Any other failure, or a second one, propagates.
    if (format !== "a4-print" || !isUploadSizeFailure(e)) throw e;
    return { ...(await rasterizeAndUpload(nodeId, stage, filename, pixelRatio / 2)), downscaled: true };
  }
}

async function rasterizeAndUpload(
  nodeId: string,
  stage: Konva.Stage,
  filename: string,
  pixelRatio: number,
): Promise<ExportResult> {
  // Konva's toBlob() already returns a Promise<Blob> and only calls `callback` on
  // SUCCESS — wrapping it in a hand-rolled Promise meant a SecurityError (tainted
  // canvas) or an OOM at a large pixelRatio rejected Konva's internal promise, which
  // nothing read, while the outer one never settled and the export hung forever.
  // Konva types toBlob()'s resolution as `unknown`; at runtime it is always a Blob.
  const blob = (await stage.toBlob({ mimeType: "image/png", pixelRatio })) as Blob | null;
  if (!blob) throw new Error("Export produced no image data");
  const file = new File([blob], filename, { type: "image/png" });
  const uploaded = await fileNodeService.upload(nodeId, file);
  return {
    fileUrl: uploaded.fileUrl ?? "",
    filename: uploaded.filename ?? filename,
    imageWidth: uploaded.imageWidth ?? Math.round(stage.width() * pixelRatio),
    imageHeight: uploaded.imageHeight ?? Math.round(stage.height() * pixelRatio),
    fileSizeBytes: uploaded.fileSizeBytes ?? blob.size,
    renderedAt: new Date().toISOString(),
  };
}

export const postNodeService = { exportRender };
