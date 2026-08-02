import { NextRequest } from "next/server";
import { uploadNodeFile, removeObject } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { FILE_NODE_IMAGE_EXTENSIONS, FILE_NODE_IMAGE_SIZE_LIMIT } from "@/lib/nodes/file-constants";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function extFromUrl(url: string): string {
  const clean = url.split("?")[0].split("#")[0];
  return clean.split(".").pop()?.toLowerCase() ?? "";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: nodeId } = await params;

  let body: { imageUrl?: string; sourceUrl?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl) return apiError("imageUrl is required", 400);

  // Verify node exists before touching the network or GCS.
  const supabase = createServerSupabase();
  const { data: nodeRow } = await supabase.from("nodes").select("data").eq("id", nodeId).maybeSingle();
  if (!nodeRow) return apiError("Node not found.", 404);

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return apiError(`Could not fetch image (HTTP ${res.status}).`, 400);

    const contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    const ext = MIME_TO_EXT[contentType] ?? extFromUrl(imageUrl);
    if (!FILE_NODE_IMAGE_EXTENSIONS.has(ext)) {
      return apiError(`Unsupported image type '${contentType || ext}'.`, 400);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > FILE_NODE_IMAGE_SIZE_LIMIT) {
      return apiError("Image too large. Maximum size is 10 MB.", 400);
    }

    // Clean up an existing file on the node if present (mirror /file/drive).
    const existingUrl = (nodeRow as { data: Record<string, unknown> }).data?.fileUrl as string | undefined;
    if (existingUrl) {
      try { await removeObject(existingUrl); } catch { /* best-effort */ }
    }

    const filename = body.filename?.trim() || `reference.${ext === "jpeg" ? "jpg" : ext}`;
    const canonicalContentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const { url: fileUrl } = await uploadNodeFile({ nodeId, filename, body: buffer, contentType: canonicalContentType });

    return apiOk({
      fileUrl,
      filename,
      fileExt: ext,
      fileKind: "image" as const,
      sourceUrl: body.sourceUrl ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return apiError(`Failed to import image from URL: ${message}`, 500);
  }
}
