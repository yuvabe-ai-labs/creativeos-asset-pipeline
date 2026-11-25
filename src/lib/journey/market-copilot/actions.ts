import "server-only";
import { claimCopilotCard } from "@/lib/db/copilot-messages";
import { JobLockedError } from "@/lib/jobs/types";
import type { ThreadMessage } from "@/lib/journey/thread/schema";
import { findBrands } from "./brands";
import { MARKET_DRAFT_KIND } from "./constants";
import { knownHandles, type MarketActions } from "./context";
import { confirmBrands, startMarketJob } from "./start";

// The market tools' actions for one onboarding turn (D530): each is the same server function the
// Market research panel's buttons reach. Each throws a sentence for the person when it cannot act,
// which the model then says in its own words.

const MOVED = "That list was confirmed or replaced a moment ago, so nothing was fetched.";
const RUNNING = "Market research is already running. Wait for it to finish.";
const NONE_KEPT = "Every brand on the list is switched off. Keep at least one first.";
export const DRAFTING_LINE = "Reading the posts…";

export function marketActions(input: {
  client: { id: string; org_id: string; name: string };
  userId: string | null;
  kbText: string;
  ownHandle: string | null;
  /** The thread before this turn: every brand already proposed is left out of a new search. */
  history: ThreadMessage[];
}): MarketActions {
  const { client, userId } = input;
  return {
    findBrands: (focus) =>
      findBrands(
        { clientName: client.name, kbText: input.kbText, ownHandle: input.ownHandle, focus, known: knownHandles(input.history) },
        { recordFor: { orgId: client.org_id, clientId: client.id, userId } },
      ),
    updateBrands: async (messageId, card) => (await claimCopilotCard(client.id, messageId, "brands", "pending", card)) !== null,
    startFetch: async (messageId, card) => {
      const result = await confirmBrands({ client, userId, messageId, card });
      if (result.status === "moved") throw new Error(MOVED);
      if (result.status === "running") throw new Error(RUNNING);
      if (result.status === "none") throw new Error(NONE_KEPT);
    },
    startDraft: async (focus) => {
      try {
        await startMarketJob({ client, userId, kind: MARKET_DRAFT_KIND, input: { focus }, phase: DRAFTING_LINE });
      } catch (e) {
        if (e instanceof JobLockedError) throw new Error(RUNNING);
        throw e;
      }
    },
  };
}
