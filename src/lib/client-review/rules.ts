// D495 / D499 — one Client review node per canvas. A canvas made before versions may already
// have several; they all stay, but none can be added. Pure: the add menu, the canvas's add
// handler, the copilot and their tests share it.

export const ONE_CLIENT_REVIEW_PER_CANVAS =
  "This canvas already has a Client review node. Upload a new cut into it as a new version.";
export const CLIENT_REVIEWS_BLOCKED_NOTE =
  "This canvas already has review nodes. Upload a new cut into one of them.";
export const CLIENT_REVIEW_DUPLICATE_REFUSED =
  "A Client review node can't be duplicated: each canvas has one. Upload a new cut into it instead.";

type Typed = { id: string; type?: string };

/** What the add menu offers for Client review: add one, open the one there is, or nothing. */
export function clientReviewAddState(nodes: readonly Typed[]): "add" | "open" | "blocked" {
  let count = 0;
  for (const n of nodes) {
    if (n.type === "client-review" && ++count > 1) return "blocked";
  }
  return count === 0 ? "add" : "open";
}

/** The canvas's one Client review node, or null when it has none or several. */
export function soleClientReviewId(nodes: readonly Typed[]): string | null {
  const reviews = nodes.filter((n) => n.type === "client-review");
  return reviews.length === 1 ? reviews[0].id : null;
}
