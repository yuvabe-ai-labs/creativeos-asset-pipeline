import type { BrandsCard, MarketBrand, StatusLine, ThreadMessage } from "@/lib/journey/thread/schema";
import type { MarketJobKind } from "./constants";

// What the onboarding copilot knows about market research once the brand KB is ready (D530), and
// what it says about it without a model. Pure: the database read is in load.ts.

export type MarketContext = {
  /** The brand KB is approved: only then does the copilot help with market research. */
  open: boolean;
  status: "pending" | "approved";
  counts: { direct: number; adjacent: number; signals: number };
  /** The client's signals by name, newest first. */
  signalNames: string[];
  /** The newest brands card still waiting on the person, from the thread. */
  pendingBrands: { messageId: string; card: BrandsCard } | null;
  /** The latest market job, whichever kind. */
  job: { kind: MarketJobKind; status: string; phaseMessage: string | null } | null;
  /** The client's own Instagram handle, never proposed as a competitor. */
  ownHandle: string | null;
};

/** What the market tools do outside the turn (the route supplies them; tests fake them). */
export type MarketActions = {
  /** Brands to look at, by web search; may be empty. */
  findBrands: (focus: string | null) => Promise<MarketBrand[]>;
  /** Writes the edited pending card; false when it was confirmed or replaced meanwhile. */
  updateBrands: (messageId: string, card: BrandsCard) => Promise<boolean>;
  /** Confirms the pending card, as this turn last left it, and starts bringing in its kept brands'
   *  posts. Throws with a sentence for the person when it could not start. */
  startFetch: (messageId: string, card: BrandsCard) => Promise<void>;
  /** Starts drafting signals from the references in Direct and Adjacent. */
  startDraft: (focus: string | null) => Promise<void>;
};

/** The offer once the brand KB is approved and nothing is in market research yet. */
export const RESEARCH_CHOICE = "Research the market";

const LIVE = new Set(["queued", "running"]);

export function marketJobRunning(m: MarketContext): boolean {
  return m.job !== null && LIVE.has(m.job.status);
}

/** The newest brands card still pending in the thread. */
export function pendingBrands(messages: ThreadMessage[]): MarketContext["pendingBrands"] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const card = messages[i].card;
    if (card?.kind === "brands" && card.status === "pending") return { messageId: messages[i].id, card };
  }
  return null;
}

/** The market context with what only the thread knows filled in. */
export function marketWithThread(m: MarketContext | undefined, messages: ThreadMessage[]): MarketContext | undefined {
  return m && { ...m, pendingBrands: pendingBrands(messages) };
}

/** Every handle already on a brands card, so a new search proposes someone new. */
export function knownHandles(messages: ThreadMessage[]): string[] {
  const seen = new Set<string>();
  for (const m of messages) if (m.card?.kind === "brands") for (const b of m.card.brands) seen.add(b.handle);
  return [...seen];
}

export function marketSuggestions(m: MarketContext): string[] {
  if (!m.open || m.status !== "pending" || marketJobRunning(m) || m.pendingBrands) return [];
  return m.counts.direct + m.counts.adjacent === 0 && m.counts.signals === 0 ? [RESEARCH_CHOICE] : [];
}

export function marketLive(m: MarketContext): StatusLine[] {
  if (!marketJobRunning(m) || !m.job) return [];
  const fallback = m.job.kind === "market-fetch" ? "Bringing in their posts…" : "Reading the posts…";
  return [{ text: m.job.phaseMessage ?? fallback, state: "running" }];
}
