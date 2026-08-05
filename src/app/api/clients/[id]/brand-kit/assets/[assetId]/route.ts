import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { deleteBrandAsset } from "@/lib/db/brand-kit";
import { SYNTHETIC_LOGO_ID } from "@/lib/brand-kit/constants";

// DELETE /api/clients/:id/brand-kit/assets/:assetId
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { assetId } = await params;
  // `Promise<{ id; assetId }>` satisfies withClient's `Promise<{ id }>` structurally — no
  // cast needed; TypeScript accepts the extra property on a non-fresh type.
  return withClient(
    params,
    async (clientId) =>
      withTryCatch("Could not remove the asset.", async () => {
        // The client's own logo is not a row (D131) — the client page owns it, and
        // deleting it there is a different act from removing a kit asset.
        if (assetId === SYNTHETIC_LOGO_ID) {
          return apiError(
            "The client logo is managed on the client's page, not here.",
            400,
          );
        }
        // False means "no such asset, or it belongs to another client". A 404 either way:
        // never confirm that a foreign resource exists.
        const removed = await deleteBrandAsset(clientId, assetId);
        if (!removed) return apiError("Asset not found.", 404);
        return apiOk({ ok: true as const });
      }),
  );
}
