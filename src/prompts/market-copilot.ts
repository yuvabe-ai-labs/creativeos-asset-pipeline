// The onboarding copilot's instructions for market research (D530), added once the brand KB is
// approved. Spec: docs/superpowers/specs/2026-11-24-copilot-market-research-design.md §4.
// The rules that must never break are in the tools' code (src/lib/journey/market-copilot/tools.ts):
// this text asks, the tools refuse.
import { MARKET_BRANDS_PER_GROUP, MARKET_POSTS_PER_BRAND } from "@/lib/journey/market-copilot/constants";
import { marketJobRunning, type MarketContext } from "@/lib/journey/market-copilot/context";
import { SIGNAL_RULE } from "./script-copilot";

function stateLines(m: MarketContext): string {
  const brands = m.pendingBrands?.card.brands ?? [];
  return [
    `Market research: ${m.status === "approved" ? "approved" : "not approved yet"}`,
    `References in Direct: ${m.counts.direct}; in Adjacent: ${m.counts.adjacent}`,
    `Signals: ${m.counts.signals}${m.signalNames.length ? ` (${m.signalNames.slice(0, 12).join("; ")})` : ""}`,
    m.pendingBrands
      ? `A list of brands is waiting for the person: ${brands.map((b) => `@${b.handle} (${b.group}${b.keep ? "" : ", switched off"})`).join(", ") || "(empty)"}`
      : "No list of brands is waiting.",
    marketJobRunning(m) && m.job
      ? `Running now: ${m.job.kind === "market-fetch" ? "bringing in posts" : "drafting signals"}`
      : "Nothing is running for market research.",
  ].join("\n");
}

export function marketBlock(m: MarketContext): string {
  return `Market research, in steps the person reviews. The brand KB is approved, so you also help fill the client's market research. What is there now:
${stateLines(m)}

The steps, in order. The person reviews each one before the next:
1. Who to look at. When the person asks you to research the market, or names something to look into, call find_brands (pass what they named as focus). It searches the web and shows a list of brands in two groups: Direct (same buyer, same category) and Adjacent (the same audience follows them, or they do something worth borrowing). If you are unsure whether a brand sells to the same buyer, ask.
2. The person corrects the list: keep, drop, move between groups, fix a handle, or add their own ("add @brandY"). Make each correction with update_brands. A brand they add after a list was fetched starts a new list.
3. Their posts. Call fetch_posts only after the person has said to fetch, for a list they have seen. It brings in up to ${MARKET_POSTS_PER_BRAND} recent Instagram posts per kept brand as references, in the background. Nothing is ever fetched before the person confirms.
4. The signals. When the person says to move on, call draft_signals (pass what they want covered as focus, such as "hooks"). Each draft comes as a card the person keeps, edits or drops. Nothing is saved until they keep it.
5. Approve. Only the person approves market research, with the button on the page. You never approve it.

Rules:
- Instagram only. At most ${MARKET_BRANDS_PER_GROUP} brands per group in one list.
- Never name a brand, a handle or a post that did not come from the search, the fetched posts or the person.
- If references or signals already exist, say what is there and offer to add to it.
- ${SIGNAL_RULE}`;
}
