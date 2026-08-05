import { apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import {
  listBrandAssets, getBrandDetails, getBrandColours,
} from "@/lib/db/brand-kit";
import { SYNTHETIC_LOGO_ID } from "@/lib/brand-kit/constants";
import type { BrandAsset } from "@/lib/brand-kit/types";

// GET /api/clients/:id/brand-kit — everything the Brand panel renders, in one response.
// The panel shows nothing useful without all three, so three round trips would only buy
// three loading states.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId, client) =>
    withTryCatch("Could not load the brand kit.", async () => {
      const [assets, details, colours] = await Promise.all([
        listBrandAssets(clientId),
        getBrandDetails(clientId),
        getBrandColours(clientId),
      ]);

      // The client's own logo is synthesized, never a row (D131), so the panel is useful
      // the first time it opens instead of empty for every existing client. It leads the
      // list because it is the canonical mark. `withClient` hands back a typed ClientRow,
      // so `logo_url` needs no cast.
      const synthetic: BrandAsset[] = client.logo_url
        ? [{
            id: SYNTHETIC_LOGO_ID,
            category: "logo",
            name: "Client logo",
            storageUrl: client.logo_url,
          }]
        : [];

      return apiOk({ assets: [...synthetic, ...assets], details, colours });
    }),
  );
}
