import { createServerSupabase } from "@/lib/supabase/server";
import {
  insertKBDocument,
  deleteKBDocument,
  getKBTotalBytes,
  KB_DOC_SIZE_LIMIT_BYTES,
} from "@/lib/db/kb";
import { DOC_EXTENSIONS } from "@/lib/kb/constants";
import {
  apiError,
  apiOk,
  withClient,
  parseFormFile,
  validateFileExtension,
  validateFileSize,
  isApiError,
} from "@/lib/api/route-helpers";

// POST /api/clients/:id/kb/documents — upload one KB document
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) => {
    const fileResult = await parseFormFile(req);
    if (isApiError(fileResult)) return fileResult;
    const { file } = fileResult;

    const extResult = validateFileExtension(file, DOC_EXTENSIONS);
    if (isApiError(extResult)) return extResult;
    const { ext } = extResult;

    const existingBytes = await getKBTotalBytes(clientId);
    const sizeError = validateFileSize(file.size, existingBytes, KB_DOC_SIZE_LIMIT_BYTES, "20 MB");
    if (sizeError) return sizeError;

    const docId = crypto.randomUUID();
    const storagePath = `${clientId}/${docId}/${file.name}`;
    const buffer = await file.arrayBuffer();

    const supabase = createServerSupabase();
    const { error: uploadError } = await supabase.storage
      .from("kb-documents")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return apiError(`Storage upload failed: ${uploadError.message}`, 500);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("kb-documents").getPublicUrl(storagePath);

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
  return withClient(params, async (clientId) => {
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

    const storageUrl: string = data.storage_url;
    const bucketMarker = "/kb-documents/";
    const pathStart = storageUrl.indexOf(bucketMarker);
    if (pathStart !== -1) {
      const storagePath = storageUrl.slice(pathStart + bucketMarker.length);
      await supabase.storage.from("kb-documents").remove([storagePath]);
    }

    await deleteKBDocument(docId);
    return apiOk({ ok: true as const });
  });
}
