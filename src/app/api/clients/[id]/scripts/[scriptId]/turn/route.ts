import { after, NextResponse } from "next/server";
import { askMarketResearch } from "@/lib/journey/market-copilot/from-script";
import { reelLabel } from "@/lib/scripts/utils";
import { z } from "zod";
import { pictureUrl, targetName } from "@/lib/scripts/copilot/picture-target";
import { apiError, withClient, withTryCatch } from "@/lib/api/route-helpers";
import {
  changeGenerateScript, changeVisualiseScript, getGenerateScript, insertScriptMessages, listScriptMessages, loadGenerateState,
} from "@/lib/db/script-generate";
import { getScript } from "@/lib/db/scripts";
import { getAiCatalog } from "@/lib/ai-models/catalog";
import { imageModelsFrom } from "@/lib/ai-models/model-lists";
import { setPanelPick } from "@/lib/db/script-panels";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";
import { boardFacts, resolvePicks } from "@/lib/scripts/visualise/board-facts";
import { loadCopilotContext } from "@/lib/scripts/copilot/context";
import { streamingCaller, structuredCaller } from "@/lib/scripts/copilot/model";
import { prepareTurn, type Reply } from "@/lib/scripts/copilot/turn";
import { MAX_PASTE_CHARS, SCRIPT_QUICK_MODEL, SCRIPT_WRITER_MODEL } from "@/lib/scripts/copilot/constants";
import { isUuid } from "@/lib/avatars/utils";
import { mightBeScript } from "@/lib/scripts/copilot/import";
import { SCRIPTS_LOCKED_MESSAGE, scriptsLocked } from "@/lib/journey/stages";

const PictureBody = z.object({ url: z.string().min(1).max(2000), name: z.string().min(1).max(200), target: z.string().regex(/^(product|location):.+$/) });

// A first draft is one long structured call; give it room (as the avatar generation routes do).
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// POST /api/clients/:id/scripts/:scriptId/turn { text (≤ 30,000: a pasted script), leadAvatarId? } — one chat message to the copilot (spec 2
// §5–§9). The person's message is saved first so it is never lost; the replies are saved after.
// The answer is newline-delimited JSON (D337, refined): `{type:"draft"}` previews while a first
// draft streams in, then one `{type:"state"}` line with the whole workspace (or `{type:"error"}`).
// Bad input is refused up front as an ordinary JSON error, before anything streams.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, { need: "generate" }, async (clientId, client, caller) =>
    withTryCatch("The copilot could not answer.", async () => {
      const body = (await req.json().catch(() => null)) as { text?: unknown; leadAvatarId?: unknown; picture?: unknown } | null;
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      // A lead chip's avatar (D362); the turn links it only if it is one of this client's.
      const leadAvatarId = typeof body?.leadAvatarId === "string" && isUuid(body.leadAvatarId) ? body.leadAvatarId : null;
      // Piece 5.1 §3.7 — a picture the browser already put on its product or location.
      const picture = PictureBody.safeParse(body?.picture).success ? PictureBody.parse(body?.picture) : null;
      if (!text && !picture) return apiError("Write a message first.", 400);
      if (text.length > MAX_PASTE_CHARS) return apiError(`Keep a message under ${MAX_PASTE_CHARS.toLocaleString("en")} characters.`, 400);

      const script = await getGenerateScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      // Piece 5.1 (D524): the copilot also answers at Visualise. In review and Approved stay read-only.
      if (script.stage !== "generate" && script.stage !== "visualise") return apiError("This script is final. Reopen it from Visualise to change it.", 409);
      const atVisualise = script.stage === "visualise";
      // Rule 14: the picture must be one this script holds, on the item it names.
      const pictured = picture && atVisualise && script.doc ? targetName(script.doc, picture.target) : null;
      if (picture && (!pictured || !script.doc || pictureUrl(script.doc, picture.target) !== picture.url)) {
        return apiError("That picture isn't on this script.", 400);
      }
      // Copilot journey spec §5.3: a new script waits for approved market research. A pasted script
      // does not, and a script already written is never stranded. Refused before anything is saved.
      if (scriptsLocked(client) && script.doc === null && !mightBeScript(text)) {
        return apiError(SCRIPTS_LOCKED_MESSAGE, 409);
      }

      const { userId, email } = caller;
      // D560 — each model call's cost is recorded for this caller, after the response.
      const recordFor = { orgId: client.org_id, clientId, userId, userEmail: email, scriptId };
      // A picture with no words is answered by code: nothing for the model to read (piece 5.1 §3.7).
      const pictureOnly = Boolean(picture && !text);
      // At Visualise the copilot is told the storyboard as it stands; read beside the history (rule 5).
      const [history, stored] = await Promise.all([
        pictureOnly ? [] : listScriptMessages(clientId, scriptId),
        atVisualise && !pictureOnly
          ? Promise.all([
              getScript(clientId, scriptId).then(async (s) => (s ? { script: s, board: await loadVisualiseBoard(clientId, s) } : null)),
              getAiCatalog(),
            ]).then(([found, catalog]) => (found ? { ...found, images: imageModelsFrom(catalog) } : null))
          : null,
      ]);
      const pictureCard = picture ? { kind: "picture" as const, ...picture } : null;
      await insertScriptMessages(clientId, scriptId, userId, [{ role: "user", content: text, card: pictureCard }]);

      // D532 — research the turn hands over goes to the market research agent once the turn is over:
      // its web search is slow, and it never holds up or fails the script's reply. Registered here,
      // in the handler, where the request scope that after() needs is certain (review fix).
      const research: string[] = [];
      let turnDone!: () => void;
      const finished = new Promise<void>((resolve) => { turnDone = resolve; });
      after(async () => {
        await finished;
        for (const question of research) {
          try {
            await askMarketResearch({
              client, userId, question,
              scriptTitle: script.doc ? `${reelLabel(script.doc.header.reelNumber) ?? "A script"} · ${script.doc.header.title}` : (script.brief.card?.title ?? "A new script"),
            });
          } catch (e) {
            console.error("[script-copilot] could not hand research to market research", e);
          }
        }
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
          try {
            let replies: Reply[];
            if (pictureOnly) replies = [{ content: `Added it to ${pictured}.`, card: null }];
            else try {
              // Signals feed the brief (suggestions, angles). An edit after the draft reads them only when
              // the script is built from some (D531), so "Rewrite with these signals" can use them.
              const builtFrom = (script.brief.signalIds?.length ?? 0) > 0;
              const ctx = await loadCopilotContext(client, { signals: script.doc === null || builtFrom });
              const apply = await prepareTurn(
                {
                  script, ctx, history, leadAvatarId, locked: scriptsLocked(client),
                  // Final review, Important 3 — a picture that came with the words is said, in code, so
                  // the copilot never asks for a picture it was just given. The saved message is as typed.
                  text: picture ? `[The person attached a picture, "${picture.name}", to ${pictured}; it is already on the board.] ${text}` : text,
                  ...(atVisualise ? { stage: "visualise" as const, board: stored ? boardFacts(stored.script, stored.board, stored.images, Date.now()) : undefined } : {}),
                },
                {
                  call: structuredCaller(SCRIPT_WRITER_MODEL, { recordFor, recordType: "script" }),
                  quick: structuredCaller(SCRIPT_QUICK_MODEL, { recordFor, recordType: "script" }),
                  stream: streamingCaller(SCRIPT_WRITER_MODEL, { recordFor, recordType: "script" }),
                  onDraft: (draft) => emit({ type: "draft", draft }),
                  // D532 — research goes to the market research agent once the reply has gone (below).
                  onResearch: (question) => { research.push(question); },
                },
              );
              const outcome = await (atVisualise ? changeVisualiseScript : changeGenerateScript)(clientId, scriptId, apply);
              replies = "error" in outcome ? [{ content: outcome.error, card: null }] : outcome.result;
              // Piece 5.1 — the panel versions the copilot picked, only for takes drawn for that shot.
              const picks = "error" in outcome ? [] : replies.flatMap((r) => r.picks ?? []);
              if (stored && picks.length > 0) {
                await Promise.all(resolvePicks(picks, stored.board.takes).map((p) => setPanelPick(script.id, p.shotId, p.takeId)));
              }
              replies = replies.map(({ picks: _picks, ...reply }) => reply);
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
            turnDone();
          }
        },
      });
      return new NextResponse(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" } });
    }),
  );
}
