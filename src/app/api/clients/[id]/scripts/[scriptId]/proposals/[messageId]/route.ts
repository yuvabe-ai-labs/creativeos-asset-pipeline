import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import {
  changeGenerateScript, claimProposalCard, insertScriptMessages, listCopilotAvatars, listScriptMessages, loadGenerateState, setMessageCard,
} from "@/lib/db/script-generate";
import { acceptImport } from "@/lib/scripts/copilot/import-turn";
import { acceptProposal } from "@/lib/scripts/copilot/turn";
import { newShotId } from "@/lib/scripts/copilot/draft";

type Ctx = { params: Promise<{ id: string; scriptId: string; messageId: string }> };

// POST /api/clients/:id/scripts/:scriptId/proposals/:messageId { decision } — accept or reject a
// multi-shot chat edit shown as a before-and-after (spec 2 §9), or a pasted script's replace card.
// Accepting re-applies its operations to the script as it is now; if a targeted shot is gone, nothing is applied (Review Focus 4).
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId, messageId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not apply that change.", async () => {
      const body = (await req.json().catch(() => null)) as { decision?: unknown } | null;
      const decision = body?.decision;
      if (decision !== "accept" && decision !== "reject") return apiError("Accept or reject.", 400);

      const message = (await listScriptMessages(clientId, scriptId)).find((m) => m.id === messageId);
      const card = message?.card?.kind === "proposal" || message?.card?.kind === "import" ? message.card : null;
      if (!card) return apiError("That change is not on this script.", 404);
      if (card.status !== "pending") return apiError("That change was already settled.", 409);

      // Claim the card first: only one decision can settle it, so two accepts never apply it twice.
      const status = decision === "accept" ? "accepted" : "rejected";
      const claimed = await claimProposalCard(clientId, scriptId, messageId, card.kind === "import" ? { ...card, status } : { ...card, status });
      if (!claimed) return apiError("That change was already settled.", 409);

      if (decision === "reject") {
        const content = card.kind === "import" ? "Kept the current draft." : "Left the script as it was.";
        await insertScriptMessages(clientId, scriptId, null, [{ role: "assistant", content, card: null }]);
      } else if (card.kind === "import") {
        // Paste-a-script spec §3: the pasted script replaces the draft.
        const outcome = await changeGenerateScript(clientId, scriptId, (current) => acceptImport(current, card));
        if ("error" in outcome) {
          await setMessageCard(clientId, scriptId, messageId, card);
          return apiError(outcome.error, outcome.status);
        }
        await insertScriptMessages(clientId, scriptId, null, [{ role: "assistant", content: outcome.result.reply, card: null }]);
      } else {
        const avatarIds = new Set((await listCopilotAvatars(clientId)).map((a) => a.id));
        const outcome = await changeGenerateScript(clientId, scriptId, (current) => acceptProposal(current, card, { newShotId, avatarIds }));
        if ("error" in outcome) {
          // Nothing was applied: put the card back so it can be tried again.
          await setMessageCard(clientId, scriptId, messageId, card);
          return apiError(outcome.error, outcome.status);
        }
        if (outcome.result.card.status !== "accepted") await setMessageCard(clientId, scriptId, messageId, outcome.result.card);
        await insertScriptMessages(clientId, scriptId, null, [{ role: "assistant", content: outcome.result.reply, card: null }]);
      }
      const state = await loadGenerateState(clientId, scriptId);
      return state ? apiOk({ state }) : apiError("Script not found.", 404);
    }),
  );
}
