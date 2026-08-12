import sharp from "sharp";
import {
  FILE_NODE_ALL_EXTENSIONS,
  FILE_NODE_IMAGE_EXTENSIONS,
  FILE_NODE_TEXT_EXTENSIONS,
  FILE_NODE_DOCUMENT_EXTENSIONS,
  FILE_NODE_IMAGE_SIZE_LIMIT,
  FILE_NODE_TEXT_SIZE_LIMIT,
  FILE_NODE_DOCUMENT_SIZE_LIMIT,
} from "@/lib/nodes/file-constants";
import {
  apiError,
  apiOk,
  parseFormFile,
  validateFileExtension,
  validateFileSize,
  isApiError,
  withNode,
} from "@/lib/api/route-helpers";
import { uploadNodeFile, removeObject } from "@/lib/storage";

// POST /api/nodes/:id/file — upload a file (.txt or image) to this File node.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId, node) => {
    const fileResult = await parseFormFile(req);
    if (isApiError(fileResult)) return fileResult;
    const { file } = fileResult;

    const extResult = validateFileExtension(file, FILE_NODE_ALL_EXTENSIONS);
    if (isApiError(extResult)) return extResult;
    const { ext } = extResult;

    const isImage = FILE_NODE_IMAGE_EXTENSIONS.has(ext);
    const isText = FILE_NODE_TEXT_EXTENSIONS.has(ext);
    const isDocument = FILE_NODE_DOCUMENT_EXTENSIONS.has(ext);
    const sizeLimit = isImage
      ? FILE_NODE_IMAGE_SIZE_LIMIT
      : isDocument
        ? FILE_NODE_DOCUMENT_SIZE_LIMIT
        : FILE_NODE_TEXT_SIZE_LIMIT;
    const sizeLabel = isImage ? "10 MB" : isDocument ? "10 MB" : "100 KB";

    const sizeError = validateFileSize(file.size, 0, sizeLimit, sizeLabel);
    if (sizeError) return sizeError;

    const existingUrl = (node.data as Record<string, unknown>)?.fileUrl as
      | string
      | undefined;
    if (existingUrl) {
      try {
        await removeObject(existingUrl);
      } catch {
        // Best-effort cleanup — don't block the new upload.
      }
    }

    if (isText) {
      const rawText = await file.text();
      return apiOk({
        filename: file.name,
        fileExt: ext,
        fileKind: "text" as const,
        rawText,
      });
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { url } = await uploadNodeFile({
        nodeId,
        filename: file.name,
        body: buffer,
        contentType: file.type,
      });

      let imageWidth: number | undefined;
      let imageHeight: number | undefined;
      if (isImage) {
        try {
          const meta = await sharp(buffer).metadata();
          imageWidth = meta.width;
          imageHeight = meta.height;
        } catch {
          // best-effort — proceed without dimensions
        }
      }

      return apiOk({
        filename: file.name,
        fileExt: ext,
        fileKind: isDocument ? ("document" as const) : ("image" as const),
        fileUrl: url,
        ...(isImage && {
          fileSizeBytes: file.size,
          imageWidth,
          imageHeight,
        }),
      });
    } catch (e) {
      return apiError(
        `Upload failed: ${e instanceof Error ? e.message : "unknown"}`,
        500,
      );
    }
  });
}

// DELETE /api/nodes/:id/file — remove the stored image or document for this node.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (_nodeId, node) => {
    const fileUrl = (node.data as Record<string, unknown>)?.fileUrl as
      | string
      | undefined;
    if (fileUrl) {
      try {
        await removeObject(fileUrl);
      } catch {
        // Best-effort cleanup
      }
    }
    return apiOk({ ok: true as const });
  });
}
