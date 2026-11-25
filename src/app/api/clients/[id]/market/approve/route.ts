import { revalidatePath } from "next/cache";
import { setMarketStatus } from "@/lib/db/clients";
import { insertCopilotMessages } from "@/lib/db/copilot-messages";
import { resolveDisplayNames } from "@/lib/db/profiles";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { approvalMessage } from "@/lib/journey/thread/approval";
import { ensureOpening } from "@/lib/journey/thread/opening";
import { ONBOARDING } from "@/lib/journey/thread/schema";

// POST /api/clients/:id/market/approve
// A person approves the client's market research, which opens new scripts (copilot journey spec
// §5.2). Needs a ready brand KB. Approving twice is a no-op, so a double click never errors.
// Only ever a person's own action: the copilot has no tool for it (D530).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, { need: "edit" }, async (clientId, client, caller) =>
    withTryCatch("Could not approve market research.", async () => {
      if (client.market_status !== "pending") return apiOk({ ok: true as const });
      if (client.kb_status !== "ready") return apiError("Approve the brand KB before market research.", 409);

      // Before the status changes, so the opening kept is the one the person was looking at.
      try {
        await ensureOpening(client);
      } catch (e) {
        console.error("[market/approve] could not keep the thread's opening", e);
      }
      await setMarketStatus(clientId, "approved");
      revalidatePath(`/clients/${client.slug}`);
      revalidatePath(`/clients/${client.slug}/market`);
      revalidatePath(`/clients/${client.slug}/scripts`);

      // Who approved, in the copilot thread. Best effort: the approval stands even if it cannot be written.
      const { userId } = caller;
      try {
        const by = (await resolveDisplayNames(client.org_id, [userId])).get(userId) ?? "A teammate";
        await insertCopilotMessages(clientId, ONBOARDING, userId, [
          { ...approvalMessage({ what: "market research", by, byId: userId, opens: "That opens scripts." }), createdBy: userId },
        ]);
      } catch (e) {
        console.error("[market/approve] could not record who approved", e);
      }
      return apiOk({ ok: true as const });
    }),
  );
}
