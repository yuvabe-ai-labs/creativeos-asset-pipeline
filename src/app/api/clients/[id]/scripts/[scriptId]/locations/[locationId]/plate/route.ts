import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import { changeScriptAssets } from "@/lib/db/script-assets";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { runBilledImageGeneration } from "@/lib/image-gen/billed-run";
import { uploadScriptAsset } from "@/lib/storage";
import { extForContentType } from "@/lib/storage/paths";
import { isVisualiseStage } from "@/lib/scripts/visualise/cast";
import { loadKbText } from "@/lib/scripts/visualise/kb-text";
import { parseRegionalKits, pickKit } from "@/lib/scripts/visualise/kits";
import { panelAspect } from "@/lib/scripts/visualise/panel-prompt";
import { PANEL_MODEL_ID } from "@/lib/scripts/visualise/constants";
import { locationPlatePrompt, LOCATION_PLATE_PROMPT_ID } from "@/prompts/location-plate";

// One Nano Banana 2.1 image, no references.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; scriptId: string; locationId: string }> };

// POST /api/clients/:id/scripts/:scriptId/locations/:locationId/plate — D448: draw the location's
// background plate. Billed to the script like a panel (runBilledImageGeneration), stored beside the
// script's other pictures, then written as the location's image through the one asset write.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId, locationId } = await params;
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not draw the location.", async () => {
      const [script, kbText, caller] = await Promise.all([
        getScript(clientId, scriptId),
        loadKbText(clientId),
        resolveCallerContext(),
      ]);
      if (!script) return apiError("Script not found.", 404);
      if (script.stage !== "generate" && !isVisualiseStage(script.stage)) {
        return apiError("Locations can be drawn while the script is being written or visualised.", 409);
      }
      const location = script.doc.locations.find((l) => l.id === locationId);
      if (!location) return apiError("No such location in this script.", 404);

      // The kit of the first shot set there, else the script's own (pickKit's fallback).
      const shot = script.doc.shots.find((s) => s.location === locationId) ?? script.doc.shots[0];
      const kit = pickKit(parseRegionalKits(kbText), script.doc, shot);
      const aspect = panelAspect(script.doc);
      const prompt = locationPlatePrompt({ location, doc: script.doc, kit, aspect });

      let url: string;
      try {
        const { generation } = await runBilledImageGeneration({
          owner: { scriptId: script.id },
          orgId: client.org_id,
          clientId,
          userId: caller.userId,
          userEmail: caller.email ?? null,
          modelId: PANEL_MODEL_ID,
          aspect,
          prompt,
          referenceUrls: [],
          inputsSnapshot: { slot: "location-plate", locationId, prompt, promptId: LOCATION_PLATE_PROMPT_ID },
          store: (body, mimeType) =>
            uploadScriptAsset({ clientId, scriptId: script.id, kind: "locations", ext: extForContentType(mimeType), body, contentType: mimeType }),
        });
        url = generation.output_snapshot ?? "";
        if (!url) throw new Error("The location could not be drawn.");
      } catch (e) {
        // Nothing was charged: the billed run refunded the reservation (D291).
        const capped = e instanceof CreditLimitError;
        return apiError(capped ? CREDIT_LIMIT_TOAST_MESSAGE : e instanceof Error ? e.message : "The location could not be drawn.", capped ? 402 : 502);
      }

      const result = await changeScriptAssets(clientId, scriptId, () => ({
        op: "set_location_image", locationId, image: { url, source: "plate" },
      }));
      if (!result.ok) return apiError(result.error, result.status);
      return apiOk({ doc: result.doc, stage: result.stage });
    }),
  );
}
