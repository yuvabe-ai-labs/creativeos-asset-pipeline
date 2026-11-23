import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { insertCopilotMessages } from "@/lib/db/copilot-messages";
import { patchKBFields } from "@/lib/db/kb";
import { ensureOpening } from "@/lib/journey/thread/opening";
import { ONBOARDING } from "@/lib/journey/thread/schema";
import { KB_REBUILT } from "@/lib/kb/approve";
import { isPatchablePath, KB_FIELD_PATCHES_MAX, kbFieldPatchSchema } from "@/lib/kb/field-patch";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  versionId: z.string().uuid(),
  patches: z.array(kbFieldPatchSchema).min(1).max(KB_FIELD_PATCHES_MAX),
});

// PATCH /api/clients/:id/kb/fields { versionId, patches } — the review screen's Save. Only the
// fields the person changed are sent, and each is merged into its own stored field, so a save never
// writes an older copy of the KB over a field the copilot or a teammate filled in the meantime.
// The save is then said in the copilot thread, which is how the copilot learns of it.
export async function PATCH(req: Request, { params }: Ctx) {
  return withClient(req, params, { need: "edit" }, async (clientId, client, caller) =>
    withTryCatch("Failed to save changes", async () => {
      const body = bodySchema.safeParse(await req.json().catch(() => null));
      if (!body.success) return apiError("Nothing to save.", 400);
      const { versionId, patches } = body.data;
      if (!patches.every((p) => isPatchablePath(p.path))) return apiError("That is not a field of the brand KB.", 400);
      // The version comes from the browser: it must be this client's own, and the one in use.
      if (versionId !== client.active_kb_version_id) return apiError(KB_REBUILT, 409);

      await patchKBFields(versionId, patches);

      // Best effort: the save stands even if the thread cannot be written.
      try {
        const { userId } = caller;
        await ensureOpening(client);
        const n = patches.length;
        await insertCopilotMessages(clientId, ONBOARDING, userId, [
          { role: "assistant", content: `Manual edits saved: ${n} field${n === 1 ? "" : "s"}.`, card: { kind: "note" }, suggestions: [], createdBy: userId },
        ]);
      } catch (e) {
        console.error("[kb/fields] could not tell the copilot thread", e);
      }
      return apiOk({ ok: true as const });
    }),
  );
}
