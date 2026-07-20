import {
  FILE_NODE_DOCUMENT_EXTENSIONS,
  FILE_NODE_IMAGE_EXTENSIONS,
  FILE_NODE_MAX_SIZE,
  fileKindForExt,
} from "@/lib/nodes/file-constants";
import { apiError, apiOk, validateFileSize } from "@/lib/api/route-helpers";
import { signNodeFileUpload } from "@/lib/storage";

// POST /api/nodes/:id/file/sign — validate metadata and return a signed URL for a
// direct browser → GCS upload of an image or document. Text files (.txt) are read
// server-side and keep using POST /api/nodes/:id/file instead.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
    size?: number;
  } | null;
  if (!body?.filename || typeof body.size !== "number") {
    return apiError("filename and size are required.", 400);
  }

  const ext = body.filename.split(".").pop()?.toLowerCase() ?? "";
  const kind = fileKindForExt(ext);
  if (kind !== "image" && kind !== "document") {
    const allowed = [
      ...FILE_NODE_IMAGE_EXTENSIONS,
      ...FILE_NODE_DOCUMENT_EXTENSIONS,
    ].join(", ");
    return apiError(
      `Unsupported file type '.${ext}' for direct upload. Allowed: ${allowed}.`,
      400,
    );
  }

  const sizeError = validateFileSize(body.size, 0, FILE_NODE_MAX_SIZE, "10 MB");
  if (sizeError) return sizeError;

  try {
    const { signedUrl, path, url } = await signNodeFileUpload({
      nodeId,
      filename: body.filename,
      contentType: body.contentType || "application/octet-stream",
    });
    return apiOk({ signedUrl, path, url });
  } catch (e) {
    // resolveOwnership throws when the node (or its canvas) does not exist.
    return apiError(
      e instanceof Error ? e.message : "Could not authorize upload.",
      404,
    );
  }
}
