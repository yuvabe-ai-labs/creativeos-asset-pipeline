import { NextRequest } from "next/server";
import { exchangeRefreshToken, fetchDriveFileBuffer } from "@/lib/drive/client";
import { uploadNodeFile } from "@/lib/storage";
import { removeNodeFileObject } from "@/lib/storage/node-file-cleanup";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import {
  FILE_NODE_IMAGE_EXTENSIONS,
  FILE_NODE_TEXT_EXTENSIONS,
  FILE_NODE_DOCUMENT_EXTENSIONS,
  FILE_NODE_IMAGE_SIZE_LIMIT,
  FILE_NODE_TEXT_SIZE_LIMIT,
  FILE_NODE_DOCUMENT_SIZE_LIMIT,
} from "@/lib/nodes/file-constants";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withNode(req, params, async (nodeId, node) => {
    let body: { driveFileId?: string; driveFileName?: string; driveMimeType?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }

    const { driveFileId, driveFileName, driveMimeType } = body;
    if (!driveFileId || !driveFileName || !driveMimeType) {
      return apiError("driveFileId, driveFileName, and driveMimeType are required", 400);
    }

    const ext = MIME_TO_EXT[driveMimeType];
    if (!ext) {
      return apiError(`File type not supported: ${driveMimeType}`, 400);
    }

    const isImage = FILE_NODE_IMAGE_EXTENSIONS.has(ext);
    const isText = FILE_NODE_TEXT_EXTENSIONS.has(ext);
    const isDocument = FILE_NODE_DOCUMENT_EXTENSIONS.has(ext);
    const sizeLimit = isText
      ? FILE_NODE_TEXT_SIZE_LIMIT
      : isImage
        ? FILE_NODE_IMAGE_SIZE_LIMIT
        : FILE_NODE_DOCUMENT_SIZE_LIMIT;
    const sizeLabel = isText ? "100 KB" : "10 MB";
    const fileKind = isText ? "text" : isImage ? "image" : "document";

    try {
      const accessToken = await exchangeRefreshToken();
      const { buffer } = await fetchDriveFileBuffer(driveFileId, accessToken);

      if (buffer.byteLength > sizeLimit) {
        return apiError(`File too large. Maximum size is ${sizeLabel}.`, 400);
      }

      // Clean up existing file if present — only when this node is its sole owner.
      const existingUrl = (node.data as Record<string, unknown>)?.fileUrl as
        | string
        | undefined;
      if (existingUrl) {
        try {
          await removeNodeFileObject(nodeId, existingUrl);
        } catch {
          // Best-effort cleanup — don't block the new upload.
        }
      }

      if (isText) {
        const rawText = new TextDecoder().decode(buffer);
        return apiOk({
          filename: driveFileName,
          fileExt: ext,
          fileKind: "text" as const,
          rawText,
          fileSizeBytes: buffer.byteLength,
          driveFileId,
          driveFileName,
          driveMimeType,
        });
      }

      // Use driveMimeType (validated against our allowlist) as the canonical content-type,
      // not the content-type header from Drive (which could diverge if the picker returns
      // a Google Workspace file that Drive exports on the fly).
      const { url: fileUrl } = await uploadNodeFile({
        nodeId,
        filename: driveFileName,
        body: Buffer.from(buffer),
        contentType: driveMimeType,
      });

      return apiOk({
        filename: driveFileName,
        fileExt: ext,
        fileKind: fileKind as "image" | "document",
        fileUrl,
        fileSizeBytes: buffer.byteLength,
        driveFileId,
        driveFileName,
        driveMimeType,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return apiError(`Failed to import file from Google Drive: ${message}`, 500);
    }
  });
}
