import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { insertBrandAsset } from "@/lib/db/brand-kit";
import type { BrandAssetCategory } from "@/lib/brand-kit/types";

const CATEGORIES = new Set<BrandAssetCategory>(["logo", "background", "product"]);

// POST /api/clients/:id/brand-kit/assets — record an object the browser has already
// uploaded. Called only after the signed PUT succeeded.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) =>
    withTryCatch("Could not save the asset.", async () => {
      const body = (await req.json().catch(() => null)) as {
        assetId?: string;
        category?: string;
        name?: string;
        url?: string;
      } | null;

      if (!body?.assetId) return apiError("assetId is required.", 400);
      if (!body.url) return apiError("url is required.", 400);
      if (!body.category || !CATEGORIES.has(body.category as BrandAssetCategory)) {
        return apiError("A valid category is required.", 400);
      }

      const asset = await insertBrandAsset({
        id: body.assetId,
        clientId,
        category: body.category as BrandAssetCategory,
        name: body.name?.trim() || "Untitled",
        storageUrl: body.url,
      });
      return apiOk({ asset });
    }),
  );
}
