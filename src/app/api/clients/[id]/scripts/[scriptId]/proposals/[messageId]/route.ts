import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import {
  changeGenerateScript, insertScriptMessages, listCopilotAvatars, listScriptMessages, loadGenerateState, setMessageCard,
} from "@/lib/db/script-generate";
import { acceptProposal } from "@/lib/scripts/copilot/turn";
import { newShotId } from "@/lib/scripts/copilot/draft";

type Ctx = { params: Promise<{ id: string; scriptId: string; messageId: string }> };

// POST /api/clients/:id/scripts/:scriptId/proposals/:messageId { decision } — accept or reject a
// multi-shot chat edit shown as a before-and-after (spec 2 §9). Accepting re-applies its operations
// to the script as it is now; if a targeted shot is gone, nothing is applied (Review Focus 4).
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId, messageId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not apply that change.", async () => {
      const body = (await req.json().catch(() => null)) as { decision?: unknown } | null;
      const decision = body?.decision;
      if (decision !== "accept" && decision !== "reject") return apiError("Accept or reject.", 400);

      const message = (await listScriptMessages(clientId, scriptId)).find((m) => m.id === messageId);
      const card = message?.card?.kind === "proposal" ? message.card : null;
      if (!card) return apiError("That change is not on this script.", 404);
      if (card.status !== "pending") return apiError("That change was already settled.", 409);

      if (decision === "reject") {
        await setMessageCard(clientId, scriptId, messageId, { ...card, status: "rejected" });
        await insertScriptMessages(clientId, scriptId, null, [{ role: "assistant", content: "Left the script as it was.", card: null }]);
      } else {
        const avatarIds = new Set((await listCopilotAvatars(clientId)).map((a) => a.id));
        const outcome = await changeGenerateScript(clientId, scriptId, (current) => acceptProposal(current, card, { newShotId, avatarIds }));
        if ("error" in outcome) return apiError(outcome.error, outcome.status);
        await setMessageCard(clientId, scriptId, messageId, outcome.result.card);
        await insertScriptMessages(clientId, scriptId, null, [{ role: "assistant", content: outcome.result.reply, card: null }]);
      }
      const state = await loadGenerateState(clientId, scriptId);
      return state ? apiOk({ state }) : apiError("Script not found.", 404);
    }),
  );
}
