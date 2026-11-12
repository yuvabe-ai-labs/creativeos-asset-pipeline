import type { ClientRow } from "@/lib/db/types";

// Copilot journey (spec 2026-11-12 §3, §6): a client moves brand KB → market research → scripts,
// and each stage opens when a person approves the one before it. Clients that existed before the
// gates were given market_status "approved", so their scripts stay open whatever their KB says.

export type StageState = "approved" | "in_progress" | "locked" | "open";
export type JourneyState = { kb: StageState; market: StageState; scripts: StageState };
export type JourneyClient = Pick<ClientRow, "kb_status" | "market_status">;

export function journeyState(client: JourneyClient): JourneyState {
  const kbReady = client.kb_status === "ready";
  const marketApproved = client.market_status === "approved";
  return {
    kb: kbReady ? "approved" : "in_progress",
    market: marketApproved ? "approved" : kbReady ? "in_progress" : "locked",
    scripts: marketApproved ? "open" : "locked",
  };
}

/** New scripts wait for approved market research. A pasted script does not (see the turn route). */
export function scriptsLocked(client: JourneyClient): boolean {
  return client.market_status !== "approved";
}

export function canApproveMarket(client: JourneyClient): boolean {
  return client.kb_status === "ready" && client.market_status === "pending";
}
