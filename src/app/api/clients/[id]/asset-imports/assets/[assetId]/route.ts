import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { deleteImportedBrandImage } from "@/lib/db/kb";

// DELETE /api/clients/:id/asset-imports/assets/:assetId — remove one imported asset (D302).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { assetId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not remove the asset.", async () => {
      // False = no such asset, another client's, or an upload. A 404 either way: never confirm
      // that a foreign resource exists.
      const removed = await deleteImportedBrandImage(clientId, assetId);
      if (!removed) return apiError("Asset not found.", 404);
      return apiOk({ ok: true as const });
    }),
  );
}
