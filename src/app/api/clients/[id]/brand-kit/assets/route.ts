import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { insertBrandAsset } from "@/lib/db/brand-kit";
import { publicUrlFor } from "@/lib/storage/gcs";
import type { BrandAssetCategory } from "@/lib/brand-kit/types";

const CATEGORIES = new Set<BrandAssetCategory>(["logo", "background", "product"]);

// POST /api/clients/:id/brand-kit/assets — record an object the browser has already
// uploaded. Called only after the signed PUT succeeded.
//
// Takes the storage PATH, never a URL. Two reasons, both found in review:
//
//  1. `uploadViaSignedUrl` sends a fixed body of { path, filename, size } plus whatever
//     `finalizeBody` the caller adds, and discards everything the sign step returned other
//     than those. An earlier version of this route demanded `assetId` and `url`, neither of
//     which the helper ever sends — so every upload signed fine, PUT fine, then died here
//     with a 400 and left an orphan blob.
//  2. Trusting a caller-supplied URL is a cross-tenant hole. It is stored verbatim and later
//     handed to `removeObject` on delete, which strips the bucket prefix and deletes
//     whatever path remains. A caller could finalize an asset under their OWN client
//     pointing at ANOTHER client's object, pass the delete ownership check (the row is
//     theirs), and destroy someone else's logo. The path is prefix-checked below instead and
//     the URL derived from it — the same guard /api/nodes/[id]/file/finalize already applies.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not save the asset.", async () => {
      const body = (await req.json().catch(() => null)) as {
        path?: string;
        filename?: string;
        category?: string;
        name?: string;
      } | null;

      if (!body?.path) return apiError("path is required.", 400);
      if (!body.category || !CATEGORIES.has(body.category as BrandAssetCategory)) {
        return apiError("A valid category is required.", 400);
      }

      const category = body.category as BrandAssetCategory;
      // The sign route built this as `clients/<id>/brand-kit/<category>/<assetId>/<name>`,
      // so anything outside this client's own folder for this category was not signed here.
      const prefix = `clients/${clientId}/brand-kit/${category}/`;
      if (!body.path.startsWith(prefix)) {
        return apiError("Upload path does not belong to this client.", 400);
      }

      // The id the sign route minted, recovered from the path rather than round-tripped
      // through the browser, so the row id and the object's folder cannot disagree.
      const assetId = body.path.slice(prefix.length).split("/")[0];
      if (!assetId) return apiError("Upload path is malformed.", 400);

      const asset = await insertBrandAsset({
        id: assetId,
        clientId,
        category,
        name: body.name?.trim() || body.filename?.trim() || "Untitled",
        storageUrl: publicUrlFor(body.path),
      });
      return apiOk({ asset });
    }),
  );
}
