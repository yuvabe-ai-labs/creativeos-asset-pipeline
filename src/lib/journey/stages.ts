import type { ClientRow } from "@/lib/db/types";

// Copilot journey (spec 2026-11-12 §3, §6): a client moves brand KB → market research → scripts,
// and each stage opens when a person approves the one before it. Clients that existed before the
// gates were given market_status "approved", so their scripts stay open whatever their KB says.

export type StageState = "approved" | "in_progress" | "locked" | "open";
export type JourneyState = { kb: StageState; market: StageState; scripts: StageState };
export type JourneyClient = Pick<ClientRow, "kb_status" | "market_status">;

export function journeyState(client: JourneyClient): JourneyState {
  const kbReady = client.kb_status === "ready";
  const marketApproved = !marketPending(client);
  return {
    kb: kbReady ? "approved" : "in_progress",
    market: marketApproved ? "approved" : kbReady ? "in_progress" : "locked",
    scripts: marketApproved ? "open" : "locked",
  };
}

/** New scripts wait for approved market research. A pasted script does not (see the turn route). */
export function scriptsLocked(client: JourneyClient): boolean {
  return marketPending(client);
}

/** What the script copilot says when a new script is asked for while they are locked. */
export const SCRIPTS_LOCKED_MESSAGE =
  "New scripts open once market research is approved. You can paste a script you already have.";

export function canApproveMarket(client: JourneyClient): boolean {
  return client.kb_status === "ready" && marketPending(client);
}

/** Only an explicit "pending" gates anything. A row read before migration 0063 reached the
 *  database has no market_status at all, and must not lock every client's scripts. */
function marketPending(client: JourneyClient): boolean {
  return client.market_status === "pending";
}

/** The stage the client is at: the first one a person has not approved yet, and scripts once both
 *  are. The copilot panel shows this stage on the screens that are not a stage's own (the client's
 *  home, Avatars, Brand assets), so the panel stays put whichever tab is open. */
export function currentStage(state: JourneyState): "kb" | "market" | "scripts" {
  if (state.kb !== "approved") return "kb";
  if (state.market !== "approved") return "market";
  return "scripts";
}
