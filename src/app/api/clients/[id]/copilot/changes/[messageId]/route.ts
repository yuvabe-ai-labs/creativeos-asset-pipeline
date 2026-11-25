import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { claimChangeCard, getCopilotMessage, setMessageCard } from "@/lib/db/copilot-messages";
import { patchKBFields, readKBFieldValues } from "@/lib/db/kb";
import { resolveDisplayNames } from "@/lib/db/profiles";
import { loadThread } from "@/lib/journey/thread/load";
import type { ChangeCard } from "@/lib/journey/thread/schema";
import { decideChange } from "@/lib/kb/changes/card";

type Ctx = { params: Promise<{ id: string; messageId: string }> };

const bodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), keep: z.array(z.string().min(1)).max(60) }),
  z.object({ decision: z.literal("discard") }),
]);

const SETTLED = "That change was already settled.";

// POST /api/clients/:id/copilot/changes/:messageId { decision, keep? } — a person approves or
// discards a change card on the brand KB (brand KB spec §2.4, D517). The card is claimed first, so
// two people deciding at once settle it once. Approving writes the kept fields as approved by the
// person, never one changed by hand since the card was made, and never touches kb_status: the KB
// stays approved. Who decided is kept on the card.
export async function POST(req: Request, { params }: Ctx) {
  const { messageId } = await params;
  return withClient(req, params, { need: "edit" }, async (clientId, client, caller) =>
    withTryCatch("Could not apply that change.", async () => {
      const body = bodySchema.safeParse(await req.json().catch(() => null));
      if (!body.success) return apiError("Approve or discard.", 400);

      const { userId } = caller;
      const message = await getCopilotMessage(clientId, messageId);
      const card = message?.card?.kind === "change" ? message.card : null;
      if (!card) return apiError("That change is not in this client's thread.", 404);
      if (card.status !== "pending") return apiError(SETTLED, 409);

      const by = (await resolveDisplayNames(client.org_id, [userId])).get(userId) ?? "A teammate";
      const decided = (status: ChangeCard["status"], kept: string[] = [], outOfDate: string[] = []): ChangeCard =>
        ({ ...card, status, decision: { by, byId: userId, at: new Date().toISOString(), kept, outOfDate } });

      let next: ChangeCard;
      let patches: Parameters<typeof patchKBFields>[1] = [];
      if (body.data.decision === "discard") {
        next = decided("discarded");
      } else if (client.active_kb_version_id !== card.versionId) {
        // Made against a KB that is no longer the one in use: nothing on it applies.
        next = decided("stale");
      } else {
        const currentValues = await readKBFieldValues(card.versionId, card.fields.map((f) => f.path));
        const decision = decideChange(card, { keep: body.data.keep, currentValues, activeVersionId: client.active_kb_version_id });
        if (decision.kind === "stale") {
          next = decided("stale");
        } else {
          next = decided("applied", decision.kept, decision.outOfDate);
          patches = decision.patches;
        }
      }

      if (!(await claimChangeCard(clientId, messageId, next))) return apiError(SETTLED, 409);
      if (patches.length > 0) {
        try {
          await patchKBFields(card.versionId, patches);
        } catch (e) {
          // Nothing was applied: the card goes back to pending, so it can be tried again.
          await setMessageCard(clientId, messageId, card);
          throw e;
        }
        revalidatePath(`/clients/${client.slug}/kb`);
      }
      return apiOk({ state: await loadThread(client) });
    }),
  );
}
