import "server-only";
import { claimCopilotCard, getCopilotCard } from "@/lib/db/copilot-messages";
import { describeError } from "@/lib/describe-error";

// Moving a brands card on when its fetch ends (D530). Shared by the fetch run and the sweep that
// settles a run that died, so a card is never left "fetching" for ever.

/** A fetch that brought nothing in: the list waits for the person again, so "try again" can fetch.
 *  Best effort: it never throws, so the job is always settled whether or not the card moved. */
export async function reopenBrandsCard(clientId: string, messageId: string): Promise<void> {
  try {
    const card = await getCopilotCard(clientId, messageId, "brands");
    if (card?.status === "fetching") await claimCopilotCard(clientId, messageId, "brands", "fetching", { ...card, status: "pending" });
  } catch (e) {
    console.error("[market-fetch] could not put the list back", { clientId, messageId, error: describeError(e) });
  }
}
