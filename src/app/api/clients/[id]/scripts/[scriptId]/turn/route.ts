import { NextResponse } from "next/server";
import { apiError, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import {
  changeGenerateScript, getGenerateScript, insertScriptMessages, listScriptMessages, loadGenerateState,
} from "@/lib/db/script-generate";
import { loadCopilotContext, loadSignals } from "@/lib/scripts/copilot/context";
import { streamingCaller, structuredCaller } from "@/lib/scripts/copilot/model";
import { prepareTurn, type Reply } from "@/lib/scripts/copilot/turn";
import { MAX_MESSAGE_CHARS, SCRIPT_QUICK_MODEL, SCRIPT_WRITER_MODEL } from "@/lib/scripts/copilot/constants";
import { isUuid } from "@/lib/avatars/utils";

// A first draft is one long structured call; give it room (as the avatar generation routes do).
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// POST /api/clients/:id/scripts/:scriptId/turn { text, leadAvatarId? } — one chat message to the copilot (spec 2
// §5–§9). The person's message is saved first so it is never lost; the replies are saved after.
// The answer is newline-delimited JSON (D337, refined): `{type:"draft"}` previews while a first
// draft streams in, then one `{type:"state"}` line with the whole workspace (or `{type:"error"}`).
// Bad input is refused up front as an ordinary JSON error, before anything streams.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("The copilot could not answer.", async () => {
      const body = (await req.json().catch(() => null)) as { text?: unknown; leadAvatarId?: unknown } | null;
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      // A lead chip's avatar (D362); the turn links it only if it is one of this client's.
      const leadAvatarId = typeof body?.leadAvatarId === "string" && isUuid(body.leadAvatarId) ? body.leadAvatarId : null;
      if (!text) return apiError("Write a message first.", 400);
      if (text.length > MAX_MESSAGE_CHARS) return apiError(`Keep a message under ${MAX_MESSAGE_CHARS} characters.`, 400);

      const script = await getGenerateScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      if (script.stage !== "generate") return apiError("This script is final. Reopen it from Visualise to change it.", 409);

      const { userId } = await resolveCallerContext();
      const history = await listScriptMessages(clientId, scriptId);
      const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")?.content ?? "";
      await insertScriptMessages(clientId, scriptId, userId, [{ role: "user", content: text, card: null }]);

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
          try {
            let replies: Reply[];
            try {
              const ctx = await loadCopilotContext(client);
              const apply = await prepareTurn(
                { script, ctx, text, lastAssistant, leadAvatarId },
                {
                  call: structuredCaller(SCRIPT_WRITER_MODEL),
                  quick: structuredCaller(SCRIPT_QUICK_MODEL),
                  stream: streamingCaller(SCRIPT_WRITER_MODEL),
                  onDraft: (draft) => emit({ type: "draft", draft }),
                  loadSignals: () => loadSignals(clientId),
                },
              );
              const outcome = await changeGenerateScript(clientId, scriptId, apply);
              replies = "error" in outcome ? [{ content: outcome.error, card: null }] : outcome.result;
            } catch (e) {
              console.error("[script-copilot] turn failed", e);
              replies = [{ content: "Something went wrong on my side, and nothing was changed. Send that again.", card: null }];
            }
            await insertScriptMessages(clientId, scriptId, null, replies.map((r) => ({ role: "assistant" as const, ...r })));
            const state = await loadGenerateState(clientId, scriptId);
            emit(state ? { type: "state", state } : { type: "error", error: "Script not found." });
          } catch (e) {
            console.error("[script-copilot] turn could not finish", e);
            emit({ type: "error", error: "The copilot could not answer." });
          } finally {
            controller.close();
          }
        },
      });
      return new NextResponse(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" } });
    }),
  );
}
