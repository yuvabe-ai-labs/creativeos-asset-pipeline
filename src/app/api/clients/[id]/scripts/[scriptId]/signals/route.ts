import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { changeGenerateScript, changeVisualiseScript, getGenerateScript, insertScriptMessages, loadGenerateState } from "@/lib/db/script-generate";
import { listSignalNames } from "@/lib/db/signals";
import { REWRITE_CHOICE, REWRITE_OFFER } from "@/lib/scripts/copilot/constants";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

const bodySchema = z.object({ signalIds: z.array(z.string().min(1).max(64)).max(20) });

const same = (a: string[] | null, b: string[]) => a !== null && a.length === b.length && a.every((id, i) => id === b[i]);

// PUT /api/clients/:id/scripts/:scriptId/signals { signalIds } — the person sets the signals a
// script is built from, on its "Built from" line (D531). Only this client's signals; only while it
// is being written or drawn. Before the draft it steers the angles and the draft; after, it changes
// no shot: the copilot offers a rewrite, which the person asks for as a change to approve.
export async function PUT(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, { need: "edit" }, async (clientId, _client, caller) =>
    withTryCatch("Could not change what the script is built from.", async () => {
      const body = bodySchema.safeParse(await req.json().catch(() => null));
      if (!body.success) return apiError("Send the signals to build from.", 400);

      const [script, signals] = await Promise.all([getGenerateScript(clientId, scriptId), listSignalNames(clientId)]);
      if (!script) return apiError("Script not found.", 404);
      if (script.stage !== "generate" && script.stage !== "visualise") return apiError("A script in review or approved keeps what it was built from.", 409);
      const known = new Set(signals.map((s) => s.id));
      const next = [...new Set(body.data.signalIds)];
      if (next.some((id) => !known.has(id))) return apiError("Only this client's signals can be used.", 400);

      const change = script.stage === "visualise" ? changeVisualiseScript : changeGenerateScript;
      const outcome = await change(clientId, scriptId, (current) =>
        // Nothing changed: nothing is written and nothing offered (performance rule 4).
        same(current.brief.signalIds, next)
          ? { patch: null, result: false }
          : { patch: { brief: { ...current.brief, signalIds: next } }, result: current.doc !== null },
      );
      if ("error" in outcome) return apiError(outcome.error, outcome.status);
      if (outcome.result) {
        await insertScriptMessages(clientId, scriptId, caller.userId, [
          { role: "assistant", content: REWRITE_OFFER, card: null, suggestions: [REWRITE_CHOICE] },
        ]);
      }
      const state = await loadGenerateState(clientId, scriptId);
      return state ? apiOk({ state }) : apiError("Script not found.", 404);
    }),
  );
}
