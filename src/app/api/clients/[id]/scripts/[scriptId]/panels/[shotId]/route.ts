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
import { panelAspect, panelChangePrompt } from "@/lib/scripts/visualise/panel-prompt";
import { promptForDraw, waitingMessage } from "@/lib/scripts/visualise/state";
import { runPanelGeneration } from "@/lib/scripts/visualise/run-panel";
import { isPanelModel } from "@/lib/scripts/visualise/constants";

// One Nano Banana 2 image with up to 14 references.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; scriptId: string; shotId: string }> };

const KindSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draw") }),
  z.object({ kind: z.literal("edited"), prompt: z.string() }),
  z.object({ kind: z.literal("reset") }),
  // D449 — Redraw: change the picked take by one note, or draw fresh with the note added.
  z.object({ kind: z.literal("change"), note: z.string().trim().min(1).max(500) }),
  z.object({ kind: z.literal("fresh"), note: z.string().trim().max(500) }),
]);
// The model chosen under Advanced, if any: only the ones offered for panels.
const DrawSchema = KindSchema.and(z.object({ modelId: z.string().refine(isPanelModel).optional() }));

// POST /api/clients/:id/scripts/:scriptId/panels/:shotId — D342–D346: draw one shot's panel.
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
        kits: board.kits, cap: panelReferenceCap(body.data.modelId),
      });
      if (inputs.waitingFor.length > 0) return apiError(waitingMessage(inputs.waitingFor), 409);

      const pickId = board.picks[shot.id];
      const current = board.takes.find((t) => t.id === pickId) ?? null;
      // D449 — a change edits the picked take: its picture is the only reference, and only the note
      // is new. Without a drawn take there is nothing to change.
      const changing = body.data.kind === "change" ? body.data.note : null;
      if (changing !== null && !current?.url) return apiError("There is no panel to change yet. Draw one first.", 409);
      const chosen = changing !== null
        ? { ok: true as const, prompt: panelChangePrompt(changing), edited: false }
        : promptForDraw(body.data, current, inputs);
      if (!chosen.ok) return apiError(chosen.error, 400);
      const referenceUrls = changing !== null ? [current!.url!] : inputs.references.map((r) => r.url);

      const caller = await resolveCallerContext();
      const take = await insertPanelTake({
        clientId, scriptId: script.id, shotId: shot.id, prompt: chosen.prompt, promptEdited: chosen.edited,
        shotKey: inputs.shotKey, faces: inputs.faces, userId: caller.userId,
      });
      let pickMoved = false;
      try {
        const { generation } = await runPanelGeneration({
          clientId, scriptId: script.id, shotId: shot.id, orgId: client.org_id,
          userId: caller.userId, userEmail: caller.email ?? null,
          aspect: panelAspect(script.doc), prompt: chosen.prompt, modelId: body.data.modelId,
          referenceUrls,
        });
        const meta = (generation.meta ?? {}) as { width?: number | null; height?: number | null };
        // YUV-422 — the pick moves first, while the take still reads as running: a board read
        // between these two writes sees a panel still drawing. The other order showed the
        // finished take with the old pick, so the old frame flashed back.
        await setPanelPick(script.id, shot.id, take.id);
        pickMoved = true;
        const done = await succeedPanelTake(take.id, {
          url: generation.output_snapshot ?? "", width: meta.width ?? null, height: meta.height ?? null,
          generationId: generation.id,
        });
        return apiOk({ take: done, pickId: done.id });
      } catch (e) {
        // Never leave the pick on a take that did not land.
        if (pickMoved && current) await setPanelPick(script.id, shot.id, current.id).catch(() => null);
        // Nothing was charged: the billed run refunded the reservation (D291).
        const capped = e instanceof CreditLimitError;
        const message = capped ? CREDIT_LIMIT_TOAST_MESSAGE : e instanceof Error ? e.message : "The panel could not be drawn.";
        await failPanelTake(take.id, message).catch(() => null);
        return apiError(message, capped ? 402 : 502);
      }
    }),
  );
}
