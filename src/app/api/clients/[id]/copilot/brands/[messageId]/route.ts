import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getCopilotCard } from "@/lib/db/copilot-messages";
import { confirmBrands } from "@/lib/journey/market-copilot/start";
import { loadThread } from "@/lib/journey/thread/load";

type Ctx = { params: Promise<{ id: string; messageId: string }> };

const bodySchema = z.object({ keep: z.array(z.string().min(1).max(30)).max(20) });

// POST /api/clients/:id/copilot/brands/:messageId { keep } — a person confirms a brands card with
// its button (D530): the handles kept are fetched, the rest switched off. Every handle must be on
// the card. The card is claimed first, so a double click or a second window starts one fetch; the
// second caller gets the thread as it now stands.
export async function POST(req: Request, { params }: Ctx) {
  const { messageId } = await params;
  return withClient(req, params, { need: "edit" }, async (clientId, client, caller) =>
    withTryCatch("Could not start bringing in their posts.", async () => {
      const body = bodySchema.safeParse(await req.json().catch(() => null));
      if (!body.success || body.data.keep.length === 0) return apiError("Keep at least one brand.", 400);
      if (client.kb_status !== "ready") return apiError("Approve the brand KB before market research.", 409);

      const card = await getCopilotCard(clientId, messageId, "brands");
      if (!card) return apiError("That list is not in this client's thread.", 404);
      if (card.status !== "pending") return apiOk({ state: await loadThread(client) });
      const onCard = new Set(card.brands.map((b) => b.handle));
      if (body.data.keep.some((h) => !onCard.has(h))) return apiError("Only brands on the list can be fetched.", 400);

      const result = await confirmBrands({ client, userId: caller.userId, messageId, card, keep: body.data.keep });
      if (result.status === "none") return apiError("Keep at least one brand.", 400);
      if (result.status === "running") return apiError("Market research is already running. Wait for it to finish.", 409);
      return apiOk({ state: await loadThread(client) });
    }),
  );
}
