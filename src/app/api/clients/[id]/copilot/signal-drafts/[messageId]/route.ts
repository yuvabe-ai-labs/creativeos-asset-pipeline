import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { claimCopilotCard, getCopilotCard } from "@/lib/db/copilot-messages";
import { createSignal } from "@/lib/db/signals";
import { loadThread } from "@/lib/journey/thread/load";
import type { SignalDraftCard } from "@/lib/journey/thread/schema";

type Ctx = { params: Promise<{ id: string; messageId: string }> };

const bodySchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("keep"),
    name: z.string().max(120),
    tags: z.array(z.string().max(40)).max(10),
    description: z.string().max(2000),
    itemIds: z.array(z.string().min(1)).min(1).max(40),
  }),
  z.object({ decision: z.literal("drop") }),
]);

// POST /api/clients/:id/copilot/signal-drafts/:messageId — a person keeps (as edited) or drops a
// signal the market agent drafted (D530). Nothing becomes a signal any other way. A kept signal
// cites only posts on its card. The card is claimed first, so keeping twice saves one signal.
export async function POST(req: Request, { params }: Ctx) {
  const { messageId } = await params;
  return withClient(req, params, { need: "edit" }, async (clientId, client, caller) =>
    withTryCatch("Could not save that signal.", async () => {
      const body = bodySchema.safeParse(await req.json().catch(() => null));
      if (!body.success) return apiError("Keep or drop the signal.", 400);

      const card = await getCopilotCard(clientId, messageId, "signal-draft");
      if (!card) return apiError("That signal is not in this client's thread.", 404);
      const settled = async () => apiOk({ state: await loadThread(client) });
      if (card.status !== "pending") return settled();

      if (body.data.decision === "drop") {
        await claimCopilotCard(clientId, messageId, "signal-draft", "pending", { ...card, status: "dropped" });
        return settled();
      }

      const name = body.data.name.trim();
      if (!name) return apiError("Give the signal a name.", 400);
      const onCard = new Set(card.itemIds);
      if (body.data.itemIds.some((id) => !onCard.has(id))) return apiError("A signal can only cite posts on its card.", 400);
      const itemIds = [...new Set(body.data.itemIds)];
      const tags = [...new Set(body.data.tags.map((t) => t.trim()).filter(Boolean))];
      const description = body.data.description.trim();

      const kept: SignalDraftCard = { ...card, status: "kept", name, tags, description, itemIds, thumbs: card.thumbs.filter((t) => onCard.has(t.itemId) && itemIds.includes(t.itemId)) };
      if (!(await claimCopilotCard(clientId, messageId, "signal-draft", "pending", kept))) return settled();
      let signalId: string;
      try {
        // Null when a post is no longer on this client's boards (deleted meanwhile): nothing saved.
        const signal = await createSignal(clientId, { name, tags, description, itemIds, createdBy: caller.userId });
        if (!signal) {
          await claimCopilotCard(clientId, messageId, "signal-draft", "kept", card);
          return apiError("One of its posts is no longer in market research. Remove it and keep again.", 400);
        }
        signalId = signal.id;
      } catch (e) {
        // Nothing was saved: the card waits for the person again.
        await claimCopilotCard(clientId, messageId, "signal-draft", "kept", card);
        throw e;
      }
      await claimCopilotCard(clientId, messageId, "signal-draft", "kept", { ...kept, signalId });
      revalidatePath(`/clients/${client.slug}/market`);
      return apiOk({ state: await loadThread(client), signalId });
    }),
  );
}
