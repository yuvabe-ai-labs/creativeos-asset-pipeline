import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { assetOpSchema, docImageUrls, opImageUrls } from "@/lib/scripts/assets";
import { changeScriptAssets, foreignImageUrls } from "@/lib/db/script-assets";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// POST /api/clients/:id/scripts/:scriptId/assets { op } — D446: one change to the script's
// products, locations or a shot's picks, from the script page. The same pure op the copilot's edits
// use (applyAssetOp), written through the one stage-aware write (changeScriptAssets).
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not change the script.", async () => {
      const parsed = assetOpSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const op = parsed.data;

      // Rule 14 — an image the doc does not already hold must be one this client may use. Checked
      // before the write; an image already in the doc stays usable (a reorder never fails because a
      // library picture was since removed from the brand kit).
      const foreign = new Set(await foreignImageUrls(clientId, scriptId, opImageUrls(op)));
      const result = await changeScriptAssets(clientId, scriptId, (doc) => {
        const held = docImageUrls(doc);
        if (opImageUrls(op).some((u) => foreign.has(u) && !held.has(u))) {
          return { error: "That picture isn't one of this client's.", status: 403 };
        }
        return op;
      });
      if (!result.ok) return apiError(result.error, result.status);
      return apiOk({ doc: result.doc, stage: result.stage });
    }),
  );
}
