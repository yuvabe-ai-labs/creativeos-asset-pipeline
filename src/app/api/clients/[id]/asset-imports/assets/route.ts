import { apiError, apiOk, withClient, withQuietErrors } from "@/lib/api/route-helpers";
import { listImportedBrandImagesPage } from "@/lib/db/kb";
import {
  IMPORT_SOURCES,
  IMPORTED_ASSETS_MAX_PAGE_SIZE,
  IMPORTED_ASSETS_PAGE_SIZE,
  type ImportSource,
} from "@/lib/asset-import/constants";
import { decodeAssetCursor, encodeAssetCursor } from "@/lib/asset-import/utils";

// GET /api/clients/:id/asset-imports/assets?cursor=&limit=&source=&media= — one page of imported
// assets, newest first (D302). `nextCursor` is null on the last page.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withQuietErrors("Couldn't load the brand assets. Try again.", async () => {
      const q = new URL(req.url).searchParams;

      const rawCursor = q.get("cursor");
      const after = decodeAssetCursor(rawCursor);
      if (rawCursor && !after) return apiError("Invalid cursor.", 400);

      const source = q.get("source");
      if (source && !IMPORT_SOURCES.includes(source as ImportSource)) return apiError("Unknown source.", 400);
      const media = q.get("media");
      if (media && media !== "image" && media !== "video") return apiError("media must be image or video.", 400);

      const requested = Number(q.get("limit") ?? IMPORTED_ASSETS_PAGE_SIZE);
      const limit = Number.isInteger(requested)
        ? Math.min(Math.max(requested, 1), IMPORTED_ASSETS_MAX_PAGE_SIZE)
        : IMPORTED_ASSETS_PAGE_SIZE;

      const { items, next } = await listImportedBrandImagesPage(clientId, {
        limit,
        after,
        source: (source as ImportSource) || null,
        mediaType: (media as "image" | "video") || null,
      });
      return apiOk({ items, nextCursor: next ? encodeAssetCursor(next) : null });
    }),
  );
}
