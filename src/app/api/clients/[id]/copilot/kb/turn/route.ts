import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
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
import { attachmentSchema, ONBOARDING } from "@/lib/journey/thread/schema";
import { startKBBuild } from "@/lib/kb/start-build";

// A turn is a few short model calls and quick saves; the build itself runs in the background.
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ text: z.string(), attachments: z.array(attachmentSchema) });

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
      const attachments = body.data.attachments;
      if (!text && attachments.length === 0) return apiError("Write a message first.", 400);
      if (text.length > KB_TURN_MAX_CHARS) return apiError(`Keep a message under ${KB_TURN_MAX_CHARS.toLocaleString("en")} characters.`, 400);
      if (attachments.length > KB_TURN_MAX_ATTACHMENTS) return apiError(`Attach at most ${KB_TURN_MAX_ATTACHMENTS} files to one message.`, 400);

      // The caller is resolved once and passed down; the context and the thread do not depend on each other.
      const [{ userId }, { ctx, documentIds, imageIds }, history] = await Promise.all([
        resolveCallerContext(),
        loadKbContext(client),
        // A failed read fails the turn here: it must never look like an empty thread.
        listCopilotMessages(clientId, ONBOARDING),
      ]);
      const owned = attachments.every((a) => (a.kind === "document" ? documentIds : imageIds).has(a.id));
      if (!owned) return apiError("That attachment does not belong to this client.", 400);

      // The opening was only shown until now; keep it, so the thread reads the same later.
      if (history.length === 0) await insertOpeningIfEmpty(clientId, ONBOARDING, openingMessage(ctx));
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
          // As the form does: the collection of images and video starts alongside and the build
          // never waits for it. If it cannot start, the build still does.
          try {
            await startAssetImports({ clientId, userId });
          } catch (e) {
            console.error("[kb-copilot] could not start the asset import", e);
          }
          await startKBBuild(clientId);
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
