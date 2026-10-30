import * as z from "zod";
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getCanvasNode, insertNodesWithFirstVersions } from "@/lib/db/canvas-graph";
import { getScript } from "@/lib/db/scripts";
import { listPanelRecipes } from "@/lib/db/script-panels";
import { uploadScriptHouseStyle } from "@/lib/storage";
import { HOUSE_STYLE_REF } from "@/lib/scripts/visualise/house-style";
import { panelForRow, type ScriptStoryboard } from "@/lib/scripts/storyboard";
import { recipeReferenceUrls, storyboardCompositeData, storyboardVersionInputs } from "@/lib/scripts/storyboard-composite";

const BodySchema = z.object({
  scriptNodeId: z.string().min(1),
  panels: z.array(z.object({
    nodeId: z.uuid(),
    label: z.string().min(1),
    position: z.object({ x: z.number(), y: z.number() }),
  })).min(1).max(40),
});
const NO_STORYBOARD = "This script has no storyboard.";

// D454 — Fan out's storyboard Composites, made here because a version needs its node to exist:
// each panel the Script node carries becomes a Composite whose v1 is the panel itself, recorded
// as it was drawn (prompt, model, settings, reference pictures). The browser only names and
// places the panels; everything recorded is read here, from the script's own takes. The browser
// then adds the nodes and wires them into their shots.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCanvas(req, params, async (canvasId, canvas) =>
    withTryCatch("Couldn't add the storyboard.", async () => {
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Say which storyboard panels to add.", 400);
      const { scriptNodeId, panels: requests } = parsed.data;

      const [caller, scriptNode] = await Promise.all([resolveCallerContext(), getCanvasNode(canvasId, scriptNodeId)]);
      const storyboard = (scriptNode?.data as { storyboard?: ScriptStoryboard } | undefined)?.storyboard;
      if (scriptNode?.type !== "script" || !storyboard?.panels?.length) return apiError(NO_STORYBOARD, 400);

      const matched = requests.map((request) => ({ request, panel: panelForRow(storyboard.panels, { label: request.label }) }));
      if (matched.some((m) => !m.panel)) return apiError("A storyboard panel is no longer on this script.", 400);

      // The node's data is the browser's to write, so its script must be this canvas's client's
      // before any of its takes are used.
      const [script, recipes] = await Promise.all([
        getScript(canvas.client_id, storyboard.scriptId),
        listPanelRecipes(storyboard.scriptId, matched.map((m) => m.panel!.takeId)),
      ]);
      if (!script) return apiError(NO_STORYBOARD, 400);
      const recipeByTake = new Map(recipes.map((r) => [r.takeId, r]));

      const usesHouseStyle = recipes.some((r) => Array.isArray(r.inputs.referenceUrls) && r.inputs.referenceUrls.includes(HOUSE_STYLE_REF.id));
      const houseStyleUrl = usesHouseStyle
        ? (await uploadScriptHouseStyle({
            clientId: canvas.client_id,
            scriptId: script.id,
            styleId: HOUSE_STYLE_REF.id,
            body: Buffer.from(HOUSE_STYLE_REF.dataUrl.split(",")[1], "base64"),
          })).url
        : "";

      // A panel whose take is gone, or no longer the picture the script was added with, is left off.
      const made = matched.flatMap(({ request, panel }) => {
        const recipe = recipeByTake.get(panel!.takeId);
        if (!recipe || recipe.url !== panel!.url) return [];
        const refs = recipeReferenceUrls(recipe.inputs, { id: HOUSE_STYLE_REF.id, url: houseStyleUrl });
        return [{
          node: { id: request.nodeId, type: "composite", position: request.position, data: storyboardCompositeData(panel!, recipe) },
          version: { output: recipe.url, inputsUsed: storyboardVersionInputs(recipe, refs), paramsUsed: recipe.params, modelUsed: recipe.modelUsed },
        }];
      });
      await insertNodesWithFirstVersions(canvasId, made, caller.userId);

      return apiOk({
        nodes: made.map(({ node, version }) => ({ id: node.id, position: node.position, data: node.data, output: version.output })),
      }, 201);
    }),
  );
}
