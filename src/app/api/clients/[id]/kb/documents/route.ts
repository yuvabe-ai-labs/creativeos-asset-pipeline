import { createServerSupabase } from "@/lib/supabase/server";
import {
  insertKBDocument,
  deleteKBDocument,
  getKBTotalBytes,
  KB_DOC_SIZE_LIMIT_BYTES,
} from "@/lib/db/kb";
import { DOC_EXTENSIONS, KB_DOC_PER_FILE_LIMIT_BYTES } from "@/lib/kb/constants";
import {
  apiError,
  apiOk,
  withClient,
  parseFormFile,
  validateFileExtension,
  validateFileSize,
  isApiError,
} from "@/lib/api/route-helpers";
import { uploadKBDocument, removeObject } from "@/lib/storage";

// POST /api/clients/:id/kb/documents — upload one KB document
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) => {
    const fileResult = await parseFormFile(req);
    if (isApiError(fileResult)) return fileResult;
    const { file } = fileResult;

    const extResult = validateFileExtension(file, DOC_EXTENSIONS);
    if (isApiError(extResult)) return extResult;
    const { ext } = extResult;

    if (file.size > KB_DOC_PER_FILE_LIMIT_BYTES) {
      return apiError(
        "Document is too large for AI analysis (max 1 MB per file). Please split or compress it.",
        400,
      );
    }

    const existingBytes = await getKBTotalBytes(clientId);
    const sizeError = validateFileSize(file.size, existingBytes, KB_DOC_SIZE_LIMIT_BYTES, "20 MB");
    if (sizeError) return sizeError;

    const docId = crypto.randomUUID();

    let publicUrl: string;
    try {
      const result = await uploadKBDocument({
        clientId,
        docId,
        filename: file.name,
        body: await file.arrayBuffer(),
        contentType: file.type || "application/octet-stream",
      });
      publicUrl = result.url;
    } catch (e) {
      return apiError(
        `Storage upload failed: ${e instanceof Error ? e.message : "unknown"}`,
        500,
      );
    }

    const doc = await insertKBDocument({
      clientId,
      filename: file.name,
      fileExt: ext,
      storageUrl: publicUrl,
      sizeBytes: file.size,
    });

    return apiOk({ document: doc }, 201);
  });
}

// DELETE /api/clients/:id/kb/documents?docId=... — remove a document
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) => {
    const docId = new URL(req.url).searchParams.get("docId");
    if (!docId) return apiError("docId query param required.", 400);

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("client_kb_documents")
      .select("storage_url, client_id")
      .eq("id", docId)
      .maybeSingle();

    if (error) return apiError(error.message, 500);
    if (!data || data.client_id !== clientId) {
      return apiError("Document not found.", 404);
    }

    try {
      await removeObject(data.storage_url);
    } catch {
      // Best-effort cleanup
    }

    await deleteKBDocument(docId);
    return apiOk({ ok: true as const });
  });
}
