import {
  insertBrandImage,
  deleteBrandImage,
  getBrandImageTotalBytes,
  KB_IMG_SIZE_LIMIT_BYTES,
} from "@/lib/db/kb";
import { IMG_EXTENSIONS } from "@/lib/kb/constants";
import {
  apiError,
  apiOk,
  withClient,
  parseFormFile,
  validateFileExtension,
  validateFileSize,
  isApiError,
} from "@/lib/api/route-helpers";
import { uploadBrandImage } from "@/lib/storage";

// POST /api/clients/:id/kb/images — upload one brand image
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) => {
    const fileResult = await parseFormFile(req);
    if (isApiError(fileResult)) return fileResult;
    const { file } = fileResult;

    const extResult = validateFileExtension(file, IMG_EXTENSIONS);
    if (isApiError(extResult)) return extResult;
    const { ext } = extResult;

    const existingBytes = await getBrandImageTotalBytes(clientId);
    const sizeError = validateFileSize(file.size, existingBytes, KB_IMG_SIZE_LIMIT_BYTES, "50 MB");
    if (sizeError) return sizeError;

    const imageId = crypto.randomUUID();

    let publicUrl: string;
    try {
      const result = await uploadBrandImage({
        clientId,
        imageId,
        filename: file.name,
        body: await file.arrayBuffer(),
        contentType: file.type,
      });
      publicUrl = result.url;
    } catch (e) {
      return apiError(
        `Image upload failed: ${e instanceof Error ? e.message : "unknown"}`,
        500,
      );
    }

    const image = await insertBrandImage({
      clientId,
      filename: file.name,
      fileExt: ext,
      storageUrl: publicUrl,
      sizeBytes: file.size,
    });

    return apiOk({ image });
  });
}

// DELETE /api/clients/:id/kb/images?imageId=...
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (_clientId) => {
    const imageId = new URL(req.url).searchParams.get("imageId");
    if (!imageId) return apiError("imageId is required.", 400);

    await deleteBrandImage(imageId);
    return apiOk({ ok: true as const });
  });
}
