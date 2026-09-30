import { createOpenAI } from "@/lib/openai/server";
import { getNodeActiveKB } from "@/lib/db/nodes";
import { normalizeSlices, buildParseContext } from "@/lib/kb/parse-context";
import { sceneSplitPrompt } from "@/prompts/scene-split";
import { parseSceneBody, compileSceneSplit } from "@/lib/nodes/scene-split";
import { normalizeBeats } from "@/lib/nodes/normalize-beats";
import { sceneFingerprint } from "@/lib/nodes/scene-beats";
import type { SceneBeat } from "@/lib/nodes/reel-script";
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/split-scene — D286. Split ONE scene of a Script node into its suggested
// cuts, when the operator turns multishot on for a scene edited since the parse. Stateless: the
// client sends the row it holds. Not a version of the Script node — the script did not change.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId) => {
    const body = (await req.json().catch(() => null)) as
      | { scene?: unknown; slices?: unknown }
      | null;
    const scene = parseSceneBody(body?.scene);
    if (!scene) return apiError("Provide a scene with a description and a length.", 400);

    const ctx = await getNodeActiveKB(nodeId);
    if (!ctx) return apiError("Node not found.", 404);
    const clientContext = ctx.kb ? buildParseContext(ctx.kb, normalizeSlices(body?.slices)) : "";
    const { system, user } = compileSceneSplit(scene, clientContext);

    return withTryCatch("Split failed", async () => {
      const completion = await createOpenAI().chat.completions.create({
        model: sceneSplitPrompt.model,
        response_format: {
          type: "json_schema",
          json_schema: { name: "scene_split", schema: sceneSplitPrompt.schema, strict: true },
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
        beats?: SceneBeat[];
      };
      return apiOk({ beats: normalizeBeats(scene, raw.beats), beatsFor: sceneFingerprint(scene) });
    });
  });
}
