import { getBrandImageTotalBytes, KB_IMG_SIZE_LIMIT_BYTES } from "@/lib/db/kb";
import { IMG_EXTENSIONS } from "@/lib/kb/constants";
import {
  apiError,
  apiOk,
  withClient,
  validateFileSize,
} from "@/lib/api/route-helpers";
import { signBrandImageUpload } from "@/lib/storage";

// POST /api/clients/:id/kb/images/sign — validate metadata and return a signed URL
// for a direct browser → GCS upload of one brand image.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) => {
    const body = (await req.json().catch(() => null)) as {
      filename?: string;
      contentType?: string;
      size?: number;
    } | null;
    if (!body?.filename || typeof body.size !== "number") {
      return apiError("filename and size are required.", 400);
    }

    const ext = body.filename.split(".").pop()?.toLowerCase() ?? "";
    if (!IMG_EXTENSIONS.has(ext)) {
      return apiError(
        `Unsupported file type '.${ext}'. Allowed: ${[...IMG_EXTENSIONS].join(", ")}.`,
        400,
      );
    }

    const existingBytes = await getBrandImageTotalBytes(clientId);
    const sizeError = validateFileSize(
      body.size,
      existingBytes,
      KB_IMG_SIZE_LIMIT_BYTES,
      "50 MB",
    );
    if (sizeError) return sizeError;

    const { signedUrl, path, url } = await signBrandImageUpload({
      clientId,
      imageId: crypto.randomUUID(),
      filename: body.filename,
      contentType: body.contentType || "application/octet-stream",
    });
    return apiOk({ signedUrl, path, url });
  });
}
