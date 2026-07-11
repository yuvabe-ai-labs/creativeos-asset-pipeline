import { NextRequest } from "next/server";
import { exchangeRefreshToken, fetchDriveFileBuffer } from "@/lib/drive/client";
import { uploadNodeFile, removeObject } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api/route-helpers";
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
  const { id: nodeId } = await params;

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
    const { buffer, contentType } = await fetchDriveFileBuffer(driveFileId, accessToken);

    if (buffer.byteLength > sizeLimit) {
      return apiError(`File too large. Maximum size is ${sizeLabel}.`, 400);
    }

    // Clean up existing file if present
    const supabase = createServerSupabase();
    const { data: nodeRow } = await supabase
      .from("nodes")
      .select("data")
      .eq("id", nodeId)
      .maybeSingle();
    const existingUrl = (nodeRow as { data: Record<string, unknown> } | null)?.data
      ?.fileUrl as string | undefined;
    if (existingUrl) {
      try {
        await removeObject(existingUrl);
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

    const { url: fileUrl } = await uploadNodeFile({
      nodeId,
      filename: driveFileName,
      body: Buffer.from(buffer),
      contentType,
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
}
