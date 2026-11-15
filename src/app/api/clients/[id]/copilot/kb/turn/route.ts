import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { IMPORT_SOURCES } from "@/lib/asset-import/constants";
import { setImportTarget, startAssetImports } from "@/lib/asset-import/start";
import { resolveCallerContext } from "@/lib/dal";
import { insertCopilotMessages, insertOpeningIfEmpty, listCopilotMessages } from "@/lib/db/copilot-messages";
import { openaiAgentModel } from "@/lib/journey/agent-model";
import {
  KB_COPILOT_MODEL, KB_TURN_FAILED_AFTER_SAVE_REPLY, KB_TURN_FAILED_REPLY, KB_TURN_MAX_ATTACHMENTS, KB_TURN_MAX_CHARS,
} from "@/lib/journey/kb-copilot/constants";
import { openingMessage } from "@/lib/journey/kb-copilot/context";
import { loadKbContext } from "@/lib/journey/kb-copilot/load";
import { runKbTurn, type KbActions } from "@/lib/journey/kb-copilot/turn";
import { loadThread } from "@/lib/journey/thread/load";
import { ONBOARDING, VIRTUAL_OPENING_ID, type Attachment, type ThreadMessage } from "@/lib/journey/thread/schema";
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
// lost; the reply is stored after. Attachments are already uploaded as brand KB sources; their
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
      const [{ userId }, { ctx, sources }, stored] = await Promise.all([
        resolveCallerContext(),
        loadKbContext(client),
        // A failed read fails the turn here: it must never look like an empty thread.
        listCopilotMessages(clientId, ONBOARDING),
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

      // Each action is the same server function the Brand KB form reaches. `acted` records that
      // something was really saved, so a failure afterwards is never reported as "nothing changed".
      let acted = false;
      const done = <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) => async (...args: A) => {
        await fn(...args);
        acted = true;
      };
      const actions: KbActions = {
        saveWebsite: done(async (url: string) => setImportTarget(clientId, "website", url)),
        saveSocials: done(async (handles: { instagram?: string; facebook?: string }) => {
          // One after the other: both merge into the same stored details.
          if (handles.instagram) await setImportTarget(clientId, "instagram", handles.instagram);
          if (handles.facebook) await setImportTarget(clientId, "facebook", handles.facebook);
        }),
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
      try {
        const result = await runKbTurn({ ctx, history, text, attachments, actions, model: openaiAgentModel(KB_COPILOT_MODEL) });
        reply = { content: result.reply, suggestions: result.suggestions };
        changed = result.changed;
      } catch (e) {
        console.error("[kb-copilot] turn failed", e);
        reply = { content: acted ? KB_TURN_FAILED_AFTER_SAVE_REPLY : KB_TURN_FAILED_REPLY, suggestions: [] };
        changed = acted;
      }
      await insertCopilotMessages(clientId, ONBOARDING, userId, [{ role: "assistant", ...reply }]);

      // An attached file is a new source, so the page on the right has changed even when no tool ran.
      const refresh = changed || attachments.length > 0;
      if (refresh) revalidatePath(`/clients/${client.slug}/kb`);
      return apiOk({ state: await loadThread(client), changed: refresh });
    }),
  );
}
