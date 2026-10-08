// A canvas's settled spend, read in ONE request and shared by every reader on the canvas —
// the header chip, each node card's footer and each focus view's Usage popover. Each of those
// used to fetch its own figure, so a 30-node canvas fired 30+ requests on load.

export type CanvasCost = {
  totalCredits: number;
  /** Settled credits per node id. A node with no generations is absent — read it as 0. */
  byNode: Record<string, number>;
};

/** Real settled credits (generations.credits_charged), not an estimate. Legacy rows that
 *  predate the credit system have none and count as zero — not backfilled. */
export function tallyCanvasCost(
  rows: { node_id: string | null; credits_charged: number | null }[],
): CanvasCost {
  const byNode: Record<string, number> = {};
  let totalCredits = 0;
  for (const row of rows) {
    const credits = row.credits_charged ?? 0;
    totalCredits += credits;
    if (row.node_id) byNode[row.node_id] = (byNode[row.node_id] ?? 0) + credits;
  }
  return { totalCredits, byNode };
}

/** One node's spend, or a pipeline's — the node plus whatever feeds it. */
export function sumNodeCredits(byNode: Record<string, number>, nodeIds: string[]): number {
  return [...new Set(nodeIds)].reduce((sum, id) => sum + (byNode[id] ?? 0), 0);
}
