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
): Promise<ExportResult> {
  const spec = POST_FORMATS[format];
  const pixelRatio = spec.width / stage.width();
  const blob: Blob = await new Promise((resolve, reject) => {
    stage.toBlob({
      mimeType: "image/png",
      pixelRatio,
      callback: (b) => (b ? resolve(b) : reject(new Error("Export produced no image data"))),
    });
  });
  const filename = buildExportFilename(title, format);
  const file = new File([blob], filename, { type: "image/png" });
  const uploaded = await fileNodeService.upload(nodeId, file);
  return {
    fileUrl: uploaded.fileUrl ?? "",
    filename: uploaded.filename ?? filename,
    imageWidth: uploaded.imageWidth ?? spec.width,
    imageHeight: uploaded.imageHeight ?? spec.height,
    fileSizeBytes: uploaded.fileSizeBytes ?? blob.size,
    renderedAt: new Date().toISOString(),
  };
}

export const postNodeService = { exportRender };
