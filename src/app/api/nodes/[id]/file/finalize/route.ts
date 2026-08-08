import { createServerSupabase } from "@/lib/supabase/server";
import { fileKindForExt } from "@/lib/nodes/file-constants";
import { apiError, apiOk, assertImpersonationWriteAllowed } from "@/lib/api/route-helpers";
import { removeObject } from "@/lib/storage";
import { publicUrlFor } from "@/lib/storage/gcs";
import { resolveOwnership } from "@/lib/storage/ownership";

// POST /api/nodes/:id/file/finalize — record a file already uploaded directly to
// GCS (via a signed URL). Verifies the path belongs to this node, cleans up any
// previous file, and returns the node data fields the client persists.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const blocked = await assertImpersonationWriteAllowed(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as {
    path?: string;
    filename?: string;
    size?: number;
    imageWidth?: number;
    imageHeight?: number;
  } | null;
  if (!body?.path || !body.filename) {
    return apiError("path and filename are required.", 400);
  }

  const ext = body.filename.split(".").pop()?.toLowerCase() ?? "";
  const kind = fileKindForExt(ext);
  if (kind !== "image" && kind !== "document") {
    return apiError(`Unsupported file type '.${ext}'.`, 400);
  }

  // Verify the uploaded object actually belongs to this node — a client could
  // otherwise finalize with an arbitrary path and point the node at someone
  // else's object.
  let expectedPrefix: string;
  try {
    const { clientId, canvasId } = await resolveOwnership(nodeId);
    expectedPrefix = `clients/${clientId}/canvases/${canvasId}/nodes/${nodeId}/files/`;
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "Node not found.", 404);
  }
  if (!body.path.startsWith(expectedPrefix)) {
    return apiError("Upload path does not belong to this node.", 400);
  }

  const supabase = createServerSupabase();
  const { data: nodeRow } = await supabase
    .from("nodes")
    .select("data")
    .eq("id", nodeId)
    .maybeSingle();
  if (!nodeRow) return apiError("Node not found.", 404);

  const existingUrl = (nodeRow as { data: Record<string, unknown> }).data
    ?.fileUrl as string | undefined;
  if (existingUrl) {
    try {
      await removeObject(existingUrl);
    } catch {
      // Best-effort cleanup — don't block the new upload.
    }
  }

  const isImage = kind === "image";
  return apiOk({
    filename: body.filename,
    fileExt: ext,
    fileKind: kind,
    fileUrl: publicUrlFor(body.path),
    ...(isImage && {
      fileSizeBytes: body.size,
      imageWidth: body.imageWidth,
      imageHeight: body.imageHeight,
    }),
  });
}
