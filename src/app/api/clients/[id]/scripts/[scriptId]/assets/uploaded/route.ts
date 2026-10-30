import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { changeScriptAssets } from "@/lib/db/script-assets";
import { scriptAssetsPrefix } from "@/lib/storage/paths";
import { publicUrlFor } from "@/lib/storage/gcs";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

const Body = z.object({
  path: z.string().min(1),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("product"), productId: z.string().min(1) }),
    z.object({ kind: z.literal("location"), locationId: z.string().min(1) }),
  ]),
});

// POST /api/clients/:id/scripts/:scriptId/assets/uploaded { path, target } — D446: the finalize step
// of a signed upload. The path must be inside this script's own folder (so a client cannot point a
// product at another client's file); a product gets the picture added after its others, a location
// has it as its plate.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not add the picture.", async () => {
      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const { path, target } = parsed.data;
      if (!path.startsWith(scriptAssetsPrefix(clientId, scriptId)) || path.includes("..")) {
        return apiError("That upload isn't this script's.", 403);
      }
      const image = { url: publicUrlFor(path), source: "upload" as const };

      const result = await changeScriptAssets(clientId, scriptId, (doc) => {
        if (target.kind === "location") return { op: "set_location_image", locationId: target.locationId, image };
        const product = doc.products.find((p) => p.id === target.productId);
        if (!product) return { error: `There is no product "${target.productId}".`, status: 404 };
        return { op: "set_product_images", productId: product.id, images: [...product.images, image] };
      });
      if (!result.ok) return apiError(result.error, result.status);
      return apiOk({ doc: result.doc, stage: result.stage, image });
    }),
  );
}
