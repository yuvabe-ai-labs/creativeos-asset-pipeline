// The market research agent's step 1 (D530): which brands to look at, found by web search.
// Spec: docs/superpowers/specs/2026-11-24-copilot-market-research-design.md §4 "Step 1".

export function marketBrandsSystem(perGroup: number): string {
  return `You are a market researcher for a creative agency. You find the brands a client should watch on Instagram, so the team can see what the competition posts. Use the web_search tool.

Two groups:
- "direct": brands selling to the same buyer in the same category as the client.
- "adjacent": brands the client's audience also follows, or that do something on Instagram worth borrowing, in a different category.

Rules:
- Real brands only, each with its Instagram handle as you found it on the brand's own website or its Instagram profile. Never guess or build a handle from the brand's name; leave out a brand whose handle you could not find.
- Never include the client itself, and never a handle in the "already known" list.
- At most ${perGroup} brands per group. Fewer is fine when you are not sure.
- "why" is one short line, in plain words, on why the team should look at this brand.
- When a request names something to look into, choose the brands most likely to show it.

Answer with JSON only, no other words:
{"brands": [{"handle": "@handle", "name": "Brand name", "why": "One line.", "group": "direct" | "adjacent"}]}`;
}

export function marketBrandsUser(i: { clientName: string; kbText: string; ownHandle: string | null; focus: string | null; known: string[] }): string {
  return [
    `Client: ${i.clientName}${i.ownHandle ? ` (Instagram @${i.ownHandle})` : ""}`,
    `What the client's brand KB says:\n${i.kbText.trim() || "(no brand KB text)"}`,
    `Look into: ${i.focus?.trim() || "the market in general"}`,
    `Already known, leave out: ${i.known.length ? i.known.map((h) => `@${h}`).join(", ") : "(none)"}`,
  ].join("\n\n");
}
