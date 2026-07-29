import { getKBTotalBytes, KB_DOC_SIZE_LIMIT_BYTES } from "@/lib/db/kb";
import { DOC_EXTENSIONS, KB_DOC_PER_FILE_LIMIT_BYTES } from "@/lib/kb/constants";
import {
  apiError,
  apiOk,
  withClient,
  validateFileSize,
} from "@/lib/api/route-helpers";
import { signKBDocumentUpload } from "@/lib/storage";

// POST /api/clients/:id/kb/documents/sign — validate metadata and return a signed
// URL for a direct browser → GCS upload of one KB document.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) => {
    const body = (await req.json().catch(() => null)) as {
      filename?: string;
      contentType?: string;
      size?: number;
    } | null;
    if (!body?.filename || typeof body.size !== "number") {
      return apiError("filename and size are required.", 400);
    }

    const ext = body.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!DOC_EXTENSIONS.has(ext)) {
      return apiError(
        `Unsupported file type '.${ext}'. Allowed: ${[...DOC_EXTENSIONS].join(", ")}.`,
        400,
      );
    }

    if (body.size > KB_DOC_PER_FILE_LIMIT_BYTES) {
      return apiError(
        "Document is too large for AI analysis (max 1 MB per file). Please split or compress it.",
        400,
      );
    }

    const existingBytes = await getKBTotalBytes(clientId);
    const sizeError = validateFileSize(
      body.size,
      existingBytes,
      KB_DOC_SIZE_LIMIT_BYTES,
      "20 MB",
    );
    if (sizeError) return sizeError;

    const { signedUrl, path, url } = await signKBDocumentUpload({
      clientId,
      docId: crypto.randomUUID(),
      filename: body.filename,
      contentType: body.contentType || "application/octet-stream",
    });
    return apiOk({ signedUrl, path, url });
  });
}
