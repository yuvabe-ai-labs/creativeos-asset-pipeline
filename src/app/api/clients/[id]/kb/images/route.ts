import { createServerSupabase } from "@/lib/supabase/server";
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

// POST /api/clients/:id/kb/images — upload one brand image
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) => {
    const fileResult = await parseFormFile(req);
    if (isApiError(fileResult)) return fileResult;
    const { file } = fileResult;

    const extResult = validateFileExtension(file, IMG_EXTENSIONS);
    if (isApiError(extResult)) return extResult;
    const { ext } = extResult;

    const existingBytes = await getBrandImageTotalBytes(clientId);
    const sizeError = validateFileSize(file.size, existingBytes, KB_IMG_SIZE_LIMIT_BYTES, "50 MB");
    if (sizeError) return sizeError;

    const supabase = createServerSupabase();
    const imageId = crypto.randomUUID();
    const storagePath = `${clientId}/${imageId}/${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("client-brand-images")
      .upload(storagePath, arrayBuffer, { contentType: file.type });

    if (uploadError) {
      return apiError(`Image upload failed: ${uploadError.message}`, 500);
    }

    const { data: publicData } = supabase.storage
      .from("client-brand-images")
      .getPublicUrl(storagePath);

    const image = await insertBrandImage({
      clientId,
      filename: file.name,
      fileExt: ext,
      storageUrl: publicData.publicUrl,
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
  return withClient(params, async (_clientId) => {
    const imageId = new URL(req.url).searchParams.get("imageId");
    if (!imageId) return apiError("imageId is required.", 400);

    await deleteBrandImage(imageId);
    return apiOk({ ok: true as const });
  });
}
