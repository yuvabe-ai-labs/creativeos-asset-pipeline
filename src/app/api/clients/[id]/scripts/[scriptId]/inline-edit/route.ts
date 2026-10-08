import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { changeGenerateScript, getGenerateScript, insertScriptMessages, loadGenerateState } from "@/lib/db/script-generate";
import { loadCopilotContext } from "@/lib/scripts/copilot/context";
import { structuredCaller } from "@/lib/scripts/copilot/model";
import { prepareInline } from "@/lib/scripts/copilot/turn";
import { MAX_MESSAGE_CHARS, MAX_SELECTION_CHARS, SCRIPT_WRITER_MODEL } from "@/lib/scripts/copilot/constants";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// POST /api/clients/:id/scripts/:scriptId/inline-edit { path, selectedText, offset, instruction } —
// spec 2 §9 "Inline AI edit": applied at once, with undo; only the selection changes.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not make that edit.", async () => {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      const path = typeof body?.path === "string" ? body.path : "";
      const selectedText = typeof body?.selectedText === "string" ? body.selectedText : "";
      const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
      const offset = typeof body?.offset === "number" && Number.isInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
      if (!selectedText || selectedText.length > MAX_SELECTION_CHARS) return apiError("Select some text first.", 400);
      if (!instruction || instruction.length > MAX_MESSAGE_CHARS) return apiError("Say what to change.", 400);

      const script = await getGenerateScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      if (script.stage !== "generate") return apiError("This script is final. Reopen it from Visualise to change it.", 409);

      const ctx = await loadCopilotContext(client);
      const prepared = await prepareInline({ script, ctx, path, selectedText, offset, instruction }, { call: structuredCaller(SCRIPT_WRITER_MODEL) });
      if ("error" in prepared) return apiError(prepared.error, prepared.status);
      const outcome = await changeGenerateScript(clientId, scriptId, prepared);
      if ("error" in outcome) return apiError(outcome.error, outcome.status);

      // "After an AI edit, the copilot says what it changed in a line" (spec 2 §9).
      await insertScriptMessages(clientId, scriptId, null, [{ role: "assistant", content: outcome.result.reply, card: null }]);
      const state = await loadGenerateState(clientId, scriptId);
      return state ? apiOk({ state, undo: outcome.result.undo }) : apiError("Script not found.", 404);
    }),
  );
}
