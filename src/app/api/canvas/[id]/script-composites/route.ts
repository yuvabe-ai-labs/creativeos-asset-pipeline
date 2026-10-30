import * as z from "zod";
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getCanvasNode, insertNodesWithFirstVersions } from "@/lib/db/canvas-graph";
import { getScript } from "@/lib/db/scripts";
import { listPanelRecipes, listPlateRecipes } from "@/lib/db/script-panels";
import { uploadScriptHouseStyle } from "@/lib/storage";
import { HOUSE_STYLE_REF } from "@/lib/scripts/visualise/house-style";
import { panelForRow, type ScriptStoryboard } from "@/lib/scripts/storyboard";
import type { ScriptCanvasAssets } from "@/lib/scripts/asset-canvas";
import {
  plateCompositeData,
  plateVersionInputs,
  recipeReferenceUrls,
  storyboardCompositeData,
  storyboardVersionInputs,
} from "@/lib/scripts/script-composites";

const Position = z.object({ x: z.number(), y: z.number() });
const BodySchema = z.object({
  scriptNodeId: z.string().min(1),
  panels: z.array(z.object({ nodeId: z.uuid(), label: z.string().min(1), position: Position })).max(40).default([]),
  plates: z.array(z.object({ nodeId: z.uuid(), locationId: z.string().min(1), position: Position })).max(20).default([]),
}).refine((b) => b.panels.length + b.plates.length > 0);
const NOTHING_TO_ADD = "This script has nothing generated to add.";

type Entry = Parameters<typeof insertNodesWithFirstVersions>[1][number];

// D454, D456 — Fan out's Composites for what the script generated, made here because a version
// needs its node to exist: each storyboard panel and each generated location plate the Script node
// carries becomes a Composite whose v1 is that picture, recorded as it was drawn (prompt, model,
// settings, reference pictures). The browser only names and places them; everything recorded is
// read here, from the script's own takes and generations. The browser then adds and wires them.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCanvas(req, params, async (canvasId, canvas) =>
    withTryCatch("Couldn't add the script's pictures.", async () => {
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Say which pictures to add.", 400);
      const { scriptNodeId, panels: panelRequests, plates: plateRequests } = parsed.data;

      const [caller, scriptNode] = await Promise.all([resolveCallerContext(), getCanvasNode(canvasId, scriptNodeId)]);
      const data = scriptNode?.data as { storyboard?: ScriptStoryboard; assets?: ScriptCanvasAssets } | undefined;
      if (scriptNode?.type !== "script") return apiError(NOTHING_TO_ADD, 400);
      const storyboard = data?.storyboard;
      const assets = data?.assets;
      if (panelRequests.length > 0 && !storyboard?.panels?.length) return apiError(NOTHING_TO_ADD, 400);
      if (plateRequests.length > 0 && !assets) return apiError(NOTHING_TO_ADD, 400);
      const scriptIds = new Set([storyboard?.scriptId, assets?.scriptId].filter((id): id is string => Boolean(id)));
      if (scriptIds.size !== 1) return apiError(NOTHING_TO_ADD, 400);
      const [scriptId] = scriptIds;

      const panels = panelRequests.map((request) => ({ request, panel: panelForRow(storyboard?.panels, { label: request.label }) }));
      const plates = plateRequests.map((request) => ({ request, location: assets?.locations.find((l) => l.id === request.locationId) }));
      if (panels.some((m) => !m.panel) || plates.some((m) => m.location?.image?.source !== "plate")) {
        return apiError("A picture is no longer on this script.", 400);
      }

      // The node's data is the browser's to write, so its script must be this canvas's client's
      // before any of its takes or generations are used.
      const [script, panelRecipes, plateRecipes] = await Promise.all([
        getScript(canvas.client_id, scriptId),
        listPanelRecipes(scriptId, panels.map((m) => m.panel!.takeId)),
        listPlateRecipes(scriptId, plates.map((m) => m.location!.image!.url)),
      ]);
      if (!script) return apiError(NOTHING_TO_ADD, 400);
      const panelByTake = new Map(panelRecipes.map((r) => [r.takeId, r]));
      const plateByUrl = new Map(plateRecipes.map((r) => [r.url, r]));

      const usesHouseStyle = panelRecipes.some((r) => Array.isArray(r.inputs.referenceUrls) && r.inputs.referenceUrls.includes(HOUSE_STYLE_REF.id));
      const houseStyleUrl = usesHouseStyle
        ? (await uploadScriptHouseStyle({
            clientId: canvas.client_id,
            scriptId,
            styleId: HOUSE_STYLE_REF.id,
            body: Buffer.from(HOUSE_STYLE_REF.dataUrl.split(",")[1], "base64"),
          })).url
        : "";

      // A picture whose take or generation is gone, or no longer the one the script was added
      // with, is left off.
      const made: Entry[] = [
        ...panels.flatMap(({ request, panel }): Entry[] => {
          const recipe = panelByTake.get(panel!.takeId);
          if (!recipe || recipe.url !== panel!.url) return [];
          const refs = recipeReferenceUrls(recipe.inputs, { id: HOUSE_STYLE_REF.id, url: houseStyleUrl });
          return [{
            node: { id: request.nodeId, type: "composite", position: request.position, data: storyboardCompositeData(panel!, recipe) },
            version: { output: recipe.url, inputsUsed: storyboardVersionInputs(recipe, refs), paramsUsed: recipe.params, modelUsed: recipe.modelUsed },
          }];
        }),
        ...plates.flatMap(({ request, location }): Entry[] => {
          const recipe = plateByUrl.get(location!.image!.url);
          if (!recipe) return [];
          return [{
            node: { id: request.nodeId, type: "composite", position: request.position, data: plateCompositeData(scriptId, location!, recipe) },
            version: { output: recipe.url, inputsUsed: plateVersionInputs(recipe), paramsUsed: recipe.params, modelUsed: recipe.modelUsed },
          }];
        }),
      ];
      await insertNodesWithFirstVersions(canvasId, made, caller.userId);

      return apiOk({
        nodes: made.map(({ node, version }) => ({ id: node.id, position: node.position, data: node.data, output: version.output })),
      }, 201);
    }),
  );
}
