import { createServerSupabase } from "@/lib/supabase/server";
import {
  NODE_FILE_BUCKET,
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
} from "@/lib/api/route-helpers";

// POST /api/nodes/:id/file — upload a file (.txt or image) to this File node.
// Returns { filename, fileExt, fileKind, fileUrl?, rawText? } — the client
// calls updateNodeData with this payload; autosave then persists it.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

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
  const sizeLabel = isImage ? "10 MB" : isDocument ? "50 MB" : "100 KB";

  const sizeError = validateFileSize(file.size, 0, sizeLimit, sizeLabel);
  if (sizeError) return sizeError;

  const supabase = createServerSupabase();

  // Clean up any existing image for this node before uploading a replacement.
  const { data: nodeRow } = await supabase
    .from("nodes")
    .select("data")
    .eq("id", nodeId)
    .maybeSingle();

  if (!nodeRow) return apiError("Node not found.", 404);

  const existingUrl = (nodeRow as { data: Record<string, unknown> }).data
    ?.fileUrl as string | undefined;

  if (existingUrl) {
    const existingPath = existingUrl.split(`/${NODE_FILE_BUCKET}/`)[1];
    if (existingPath) {
      await supabase.storage.from(NODE_FILE_BUCKET).remove([existingPath]);
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

  // Document (PDF/DOCX) — upload to storage, same as image branch.
  if (isDocument) {
    const storagePath = `${nodeId}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(NODE_FILE_BUCKET)
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: true,
      });
    if (uploadError) {
      return apiError(`Upload failed: ${uploadError.message}`, 500);
    }
    const { data: publicData } = supabase.storage
      .from(NODE_FILE_BUCKET)
      .getPublicUrl(storagePath);
    return apiOk({
      filename: file.name,
      fileExt: ext,
      fileKind: "document" as const,
      fileUrl: publicData.publicUrl,
    });
  }

  // Image — upload to storage.
  const storagePath = `${nodeId}/${file.name}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(NODE_FILE_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: true, // overwrite if same filename (e.g. re-upload after name clash)
    });

  if (uploadError) {
    return apiError(`Upload failed: ${uploadError.message}`, 500);
  }

  const { data: publicData } = supabase.storage
    .from(NODE_FILE_BUCKET)
    .getPublicUrl(storagePath);

  return apiOk({
    filename: file.name,
    fileExt: ext,
    fileKind: "image" as const,
    fileUrl: publicData.publicUrl,
  });
}

// DELETE /api/nodes/:id/file — remove the stored image or document for this node.
// Only needed for images + documents (text content lives in nodes.data, cleared by client).
// Client calls this, then clears the node data via updateNodeData.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const supabase = createServerSupabase();

  const { data: nodeRow } = await supabase
    .from("nodes")
    .select("data")
    .eq("id", nodeId)
    .maybeSingle();

  if (!nodeRow) return apiError("Node not found.", 404);

  const fileUrl = (nodeRow as { data: Record<string, unknown> }).data
    ?.fileUrl as string | undefined;

  if (fileUrl) {
    const storagePath = fileUrl.split(`/${NODE_FILE_BUCKET}/`)[1];
    if (storagePath) {
      await supabase.storage.from(NODE_FILE_BUCKET).remove([storagePath]);
    }
  }

  return apiOk({ ok: true as const });
}
