import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { signClientBrandAssetUpload } from "@/lib/storage";
import { LOGO_EXTENSIONS } from "@/lib/clients/constants";
import type { BrandAssetCategory } from "@/lib/brand-kit/types";

const CATEGORIES = new Set<BrandAssetCategory>(["logo", "background", "product"]);

// POST /api/clients/:id/brand-kit/assets/sign — validate, then hand back a signed URL for a
// direct browser -> GCS upload. Bytes never pass through the app.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) => {
    const body = (await req.json().catch(() => null)) as {
      filename?: string;
      contentType?: string;
      category?: string;
    } | null;

    if (!body?.filename) return apiError("filename is required.", 400);
    if (!body.category || !CATEGORIES.has(body.category as BrandAssetCategory)) {
      return apiError("A valid category is required.", 400);
    }

    const ext = body.filename.split(".").pop()?.toLowerCase() ?? "";
    // LOGO_EXTENSIONS already allows svg and gif beyond the standard image set, which is
    // right for brand marks. Reused rather than redeclared.
    if (!LOGO_EXTENSIONS.has(ext)) {
      return apiError(
        `Unsupported file type '.${ext}'. Allowed: ${[...LOGO_EXTENSIONS].join(", ")}.`,
        400,
      );
    }

    // Minted here so the storage path and the row that follows carry the same id.
    const assetId = crypto.randomUUID();
    const { signedUrl, path, url } = await signClientBrandAssetUpload({
      clientId,
      category: body.category as BrandAssetCategory,
      assetId,
      filename: body.filename,
      contentType: body.contentType || "application/octet-stream",
    });
    return apiOk({ signedUrl, path, url, assetId });
  });
}
