import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import { failPanelTake, insertPanelTake, setPanelPick, succeedPanelTake } from "@/lib/db/script-panels";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";
import { isVisualiseStage } from "@/lib/scripts/visualise/cast";
import { panelInputs, panelReferenceCap } from "@/lib/scripts/visualise/panel-inputs";
import { panelAspect } from "@/lib/scripts/visualise/panel-prompt";
import { promptForDraw, waitingMessage } from "@/lib/scripts/visualise/state";
import { runPanelGeneration } from "@/lib/scripts/visualise/run-panel";

// One Nano Banana 2 image with up to 14 references.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; scriptId: string; shotId: string }> };

const DrawSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draw") }),
  z.object({ kind: z.literal("edited"), prompt: z.string() }),
  z.object({ kind: z.literal("reset") }),
]);

// POST /api/clients/:id/scripts/:scriptId/panels/:shotId — D341–D345: draw one shot's panel.
// The take is stored "running" with what it is drawn from (prompt, shot fingerprint, faces)
// BEFORE the model is called, so an avatar refined mid-draw shows the result out of date at
// once. A drawn take becomes the pick; the operator can pick an earlier one back.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId, shotId } = await params;
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not draw the panel.", async () => {
      const body = DrawSchema.safeParse(await req.json().catch(() => null));
      if (!body.success) return apiError("Invalid request body.", 400);

      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      if (!isVisualiseStage(script.stage)) {
        return apiError("Panels can be drawn only while the script is in Visualise or In review.", 409);
      }
      const shot = script.doc.shots.find((s) => s.id === shotId);
      if (!shot) return apiError("No such shot in this script.", 404);

      const board = await loadVisualiseBoard(clientId, script);
      const inputs = panelInputs({
        doc: script.doc, shot, avatars: new Map(board.avatars.map((a) => [a.id, a])),
        kits: board.kits, cap: panelReferenceCap(),
      });
      if (inputs.waitingFor.length > 0) return apiError(waitingMessage(inputs.waitingFor), 409);

      const pickId = board.picks[shot.id];
      const current = board.takes.find((t) => t.id === pickId) ?? null;
      const chosen = promptForDraw(body.data, current, inputs);
      if (!chosen.ok) return apiError(chosen.error, 400);

      const caller = await resolveCallerContext();
      const take = await insertPanelTake({
        clientId, scriptId: script.id, shotId: shot.id, prompt: chosen.prompt, promptEdited: chosen.edited,
        shotKey: inputs.shotKey, faces: inputs.faces, userId: caller.userId,
      });
      try {
        const { generation } = await runPanelGeneration({
          clientId, scriptId: script.id, shotId: shot.id, orgId: client.org_id,
          userId: caller.userId, userEmail: caller.email ?? null,
          aspect: panelAspect(script.doc), prompt: chosen.prompt,
          referenceUrls: inputs.references.map((r) => r.url),
        });
        const meta = (generation.meta ?? {}) as { width?: number | null; height?: number | null };
        const done = await succeedPanelTake(take.id, {
          url: generation.output_snapshot ?? "", width: meta.width ?? null, height: meta.height ?? null,
          generationId: generation.id,
        });
        await setPanelPick(script.id, shot.id, done.id);
        return apiOk({ take: done, pickId: done.id });
      } catch (e) {
        // Nothing was charged: the billed run refunded the reservation (D291).
        const capped = e instanceof CreditLimitError;
        const message = capped ? CREDIT_LIMIT_TOAST_MESSAGE : e instanceof Error ? e.message : "The panel could not be drawn.";
        await failPanelTake(take.id, message).catch(() => null);
        return apiError(message, capped ? 402 : 502);
      }
    }),
  );
}
