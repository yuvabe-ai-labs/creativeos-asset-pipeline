import { revalidatePath } from "next/cache";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { IMPORT_SOURCES } from "@/lib/asset-import/constants";
import { setImportTarget, startAssetImports } from "@/lib/asset-import/start";
import { importTargetEditValue } from "@/lib/asset-import/utils";
import { resolveCallerContext } from "@/lib/dal";
import { insertCopilotMessages, insertOpeningIfEmpty, listCopilotMessages, type NewCopilotMessage } from "@/lib/db/copilot-messages";
import { getActiveKBVersion, patchKBFields } from "@/lib/db/kb";
import { openaiAgentModel } from "@/lib/journey/agent-model";
import {
  KB_COPILOT_MODEL, KB_TURN_FAILED_AFTER_SAVE_REPLY, KB_TURN_FAILED_REPLY, KB_TURN_MAX_ATTACHMENTS, KB_TURN_MAX_CHARS,
} from "@/lib/journey/kb-copilot/constants";
import { isBuilding, openingMessage } from "@/lib/journey/kb-copilot/context";
import { reviewFields } from "@/lib/journey/kb-copilot/review";
import { walkMessages, walkOf, type TurnWalk } from "@/lib/journey/kb-copilot/walk";
import { loadKbContext } from "@/lib/journey/kb-copilot/load";
import { runKbTurn, type KbActions, type KbReview, type KbSaved } from "@/lib/journey/kb-copilot/turn";
import { loadThread } from "@/lib/journey/thread/load";
import { ONBOARDING, VIRTUAL_OPENING_ID, type Attachment, type ThreadMessage } from "@/lib/journey/thread/schema";
import { NDJSON_HEADERS, type KbTurnEvent } from "@/lib/journey/thread/turn-events";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { startKBBuild } from "@/lib/kb/start-build";

// A turn is a few short model calls and quick saves; the build itself runs in the background.
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Only an attachment's kind and id are taken from the browser. Its name and address come from the
// server's own rows, so nothing the browser sends is stored, shown to teammates or given to the model.
const bodySchema = z.object({
  text: z.string(),
  attachments: z.array(z.object({ kind: z.enum(["document", "image"]), id: z.string().uuid() })),
});

// POST /api/clients/:id/copilot/kb/turn { text, attachments } — one message to the brand KB
// copilot (spec 2026-11-12 brand KB §2.1). The person's message is stored first so it is never
// lost; the reply is stored after. Bad input is refused as ordinary JSON before anything streams;
// a turn that starts answers as newline-delimited JSON events (turn-events.ts). Attachments are already uploaded as brand KB sources; their
// ids are checked against this client's own documents and images.
export async function POST(req: Request, { params }: Ctx) {
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("The copilot could not answer.", async () => {
      const body = bodySchema.safeParse(await req.json().catch(() => null));
      if (!body.success) return apiError("Write a message first.", 400);
      const text = body.data.text.trim();
      const asked = body.data.attachments;
      if (!text && asked.length === 0) return apiError("Write a message first.", 400);
      if (text.length > KB_TURN_MAX_CHARS) return apiError(`Keep a message under ${KB_TURN_MAX_CHARS.toLocaleString("en")} characters.`, 400);
      if (asked.length > KB_TURN_MAX_ATTACHMENTS) return apiError(`Attach at most ${KB_TURN_MAX_ATTACHMENTS} files to one message.`, 400);

      // The caller is resolved once and passed down; the context and the thread do not depend on each other.
      // A built KB in review is read once per turn (never by the polled read): the copilot answers
      // about its fields and may fill the ones still unreviewed.
      const reviewing = client.kb_status === "in_review" && client.active_kb_version_id !== null;
      const [{ userId }, { ctx, sources }, stored, version] = await Promise.all([
        resolveCallerContext(),
        loadKbContext(client),
        // A failed read fails the turn here: it must never look like an empty thread.
        listCopilotMessages(clientId, ONBOARDING),
        reviewing ? getActiveKBVersion(clientId) : Promise.resolve(null),
      ]);
      const attachments: Attachment[] = [];
      for (const a of asked) {
        const source = sources.get(a.id);
        if (!source || source.kind !== a.kind) return apiError("That attachment does not belong to this client.", 400);
        attachments.push(source);
      }

      // The opening was only shown until now; keep it, so the thread reads the same later.
      const opening = openingMessage(ctx);
      if (stored.length === 0) await insertOpeningIfEmpty(clientId, ONBOARDING, opening);
      // The model must see the line the person is answering: a typed "yes" means nothing without it.
      const history: ThreadMessage[] = stored.length > 0
        ? stored
        : [{ id: VIRTUAL_OPENING_ID, role: "assistant", content: opening, card: null, attachments: [], suggestions: [], createdAt: "" }];
      await insertCopilotMessages(clientId, ONBOARDING, userId, [{ role: "user", content: text, attachments }]);

      // From here the answer is a stream of event lines (D502): what the copilot does is sent as it
      // happens, and the last line is the whole thread, as the turn used to answer in one piece.
      // A line that cannot be sent (the browser has gone) is dropped; it never stops the turn.
      const encoder = new TextEncoder();
      let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
      const emit = (event: KbTurnEvent) => {
        try {
          controller?.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Nobody is reading any more.
        }
      };

      const turn = async () => {
        try {
          // The review walk as the thread stood before this message. A question only counts as waiting
          // while its field is still unreviewed: one settled by hand on the page is no longer asked.
          const walk = walkOf(history);
          const fields = version ? reviewFields(version.output as unknown as TraceableBrandKB) : null;
          const review: KbReview | null = fields
            ? { fields, pending: fields.some((f) => f.path === walk.pending && f.status === "needs_review") ? walk.pending : null }
            : null;

          // Each action is the same server function the Brand KB form reaches. `acted` records that
          // something was really saved, so a failure afterwards is never reported as "nothing changed".
          let acted = false;
          const done = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A) => {
            const result = await fn(...args);
            acted = true;
            return result;
          };
          const actions: KbActions = {
            // Both report what was stored, in the form's own shape: the website as saved, a handle bare.
            saveWebsite: done(async (url: string) => (await setImportTarget(clientId, "website", url)).website ?? url),
            saveSocials: done(async (handles: { instagram?: string; facebook?: string }) => {
              const stored: { instagram?: string; facebook?: string } = {};
              // One after the other: both merge into the same stored details.
              for (const source of ["instagram", "facebook"] as const) {
                const handle = handles[source];
                if (handle) stored[source] = importTargetEditValue(source, (await setImportTarget(clientId, source, handle))[source]) || handle;
              }
              return stored;
            }),
            setField: async (path, patch) => {
              if (!version) throw new Error("There is no brand KB in review.");
              // One field, merged into what is stored, and only if nobody has reviewed it since this
              // turn began: the database checks that at the moment of the write.
              const written = (await patchKBFields(version.id, [{ path: path.split("."), patch }], { onlyUnreviewed: true })) > 0;
              if (written) acted = true;
              return written;
            },
            startBuild: done(async () => {
              await startKBBuild(clientId);
              // Only once the build has really started, and only from sources never collected before:
              // collecting costs money, and the copilot never does it again without being asked (spec §6).
              // The build never waits for it, and still stands if it cannot start.
              const fresh = IMPORT_SOURCES.filter((source) => !ctx.importedBefore.includes(source));
              if (fresh.length === 0) return;
              try {
                await startAssetImports({ clientId, userId, sources: fresh });
              } catch (e) {
                console.error("[kb-copilot] could not start the asset import", e);
              }
            }),
          };

          let reply: { content: string; suggestions: string[] };
          let changed: boolean;
          let turnWalk: TurnWalk | null = null;
          let saved: KbSaved = {};
          try {
            const result = await runKbTurn({
              ctx, history, text, attachments, actions, review, model: openaiAgentModel(KB_COPILOT_MODEL),
              on: {
                step: (line) => emit({ type: "step", text: line }),
                text: (delta) => emit({ type: "text", delta }),
                reset: () => emit({ type: "reset" }),
                saved: (stored) => emit({ type: "saved", saved: stored }),
                page: () => emit({ type: "page" }),
              },
            });
            reply = { content: result.reply, suggestions: result.suggestions };
            changed = result.changed;
            turnWalk = result.walk;
            saved = result.saved;
          } catch (e) {
            console.error("[kb-copilot] turn failed", e);
            reply = { content: acted ? KB_TURN_FAILED_AFTER_SAVE_REPLY : KB_TURN_FAILED_REPLY, suggestions: [] };
            changed = acted;
          }
          // Code, not the model, asks the next question (spec §2.3), and never while a build runs or
          // after a turn that failed. The fields are the ones read above with this turn's answers laid
          // over them.
          const settled = turnWalk?.settled ?? [];
          const extra: NewCopilotMessage[] = fields && turnWalk && !isBuilding(ctx)
            ? walkMessages({ fields: fields.map((f) => (settled.includes(f.path) ? { ...f, status: "approved" as const } : f)), walk, turn: turnWalk })
            : [];
          // One insert, so the reply and the question that follows it are stored in order. When a
          // question follows, its own choices are the ones offered.
          await insertCopilotMessages(clientId, ONBOARDING, userId, [
            { role: "assistant", content: reply.content, suggestions: extra.length > 0 ? [] : reply.suggestions },
            ...extra,
          ]);

          // An attached file is a new source, so the page on the right has changed even when no tool ran.
          const refresh = changed || attachments.length > 0;
          if (refresh) revalidatePath(`/clients/${client.slug}/kb`);
          // `saved` is the website or handles this turn stored. The form shows them from here at once;
          // the page is still re-read after, so everything else on it catches up.
          emit({ type: "state", state: await loadThread(client), changed: refresh, saved });
        } catch (e) {
          // The person's message is stored; the browser re-reads the thread to see what else is.
          console.error("[kb-copilot] turn could not finish", e);
          emit({ type: "error", error: "The copilot could not answer." });
        } finally {
          try {
            controller?.close();
          } catch {
            // Already closed by the browser going away.
          }
        }
      };

      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      });
      // The turn is seen through even if the browser leaves in the middle of it: a reply is never
      // lost to a closed tab.
      const work = turn();
      after(() => work);
      return new NextResponse(stream, { headers: NDJSON_HEADERS });
    }),
  );
}
