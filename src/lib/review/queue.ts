import type { OrgRole } from "@/lib/dal-logic";
import type { ApprovalStatus } from "@/lib/approval";

// One row of org_review_counts (migration 0031), already grouped by the database.
export type ReviewCountRow = { clientId: string; canvasId: string; pending: number };

export type ReviewCounts = {
  byClient: Record<string, number>;
  byCanvas: Record<string, number>;
  total: number;
};

// R5.5: the client figure is DERIVED from the canvas figures rather than queried
// separately, so the two cannot disagree. This is the whole reason both groupings come
// back from one RPC scan instead of two queries that would each be "obviously correct"
// while disagreeing in production.
export function summarizeCounts(rows: ReviewCountRow[]): ReviewCounts {
  const byClient: Record<string, number> = {};
  const byCanvas: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byCanvas[row.canvasId] = (byCanvas[row.canvasId] ?? 0) + row.pending;
    byClient[row.clientId] = (byClient[row.clientId] ?? 0) + row.pending;
    total += row.pending;
  }
  return { byClient, byCanvas, total };
}

// One row of the navbar popover (org-wide) or the canvas review drawer (one canvas).
// Both surfaces show the same shape because they differ only in SCOPE (R9.7).
export type InboxItem = {
  versionId: string;
  nodeId: string;
  nodeType: string;
  nodeTitle: string | null;
  clientName: string;
  clientSlug: string;
  canvasName: string;
  canvasSlug: string;
  output: string | null;
  approvalStatus: ApprovalStatus;
  note: string | null;
  operatorUserId: string | null;
  makerName: string | null; // resolved display name, else the legacy string (R11.4)
  createdAt: string;
};

// R9.5 — ONE control, one meaning: "things waiting on you."
//
//   designer        -> their own rejected work (what they must fix)
//   senior | owner  -> everything pending review, PLUS their own rejected work
//
// The senior case is a union rather than a branch on purpose: a senior whose own asset was
// rejected still needs to see it. And a senior does NOT see other people's rejections —
// those are waiting on the maker, not on them, which is the one place this workflow is
// person-specific (R4.3).
export function selectInboxFor(
  role: OrgRole,
  userId: string,
  items: InboxItem[],
): InboxItem[] {
  const mineRejected = (i: InboxItem) =>
    i.approvalStatus === "changes_requested" && i.operatorUserId === userId;

  if (role === "designer") return items.filter(mineRejected);
  return items.filter((i) => i.approvalStatus === "pending" || mineRejected(i));
}
