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
  // D170: who approved, and whether the maker has seen it yet. Not rendered — kept in
  // sync with inboxFilterFor's SQL clause via the selectInboxFor equivalence test in
  // queue.test.ts (selectInboxFor itself has no runtime caller).
  approvedByUserId: string | null;
  approvedSeenAt: string | null;
  createdAt: string;
};

// R9.5 — ONE control, one meaning: "things waiting on you."
//
//   designer        -> their own rejected work, PLUS their own unseen approvals (D170)
//   senior | owner  -> everything pending review, PLUS their own rejected work,
//                      PLUS their own unseen approvals
//
// The senior case is a union rather than a branch on purpose: a senior whose own asset was
// rejected — or approved by someone else — still needs to see it. And a senior does NOT
// see other people's rejections or approvals; those are waiting on the maker, not on them,
// which is the one place this workflow is person-specific (R4.3).
export function selectInboxFor(
  role: OrgRole,
  userId: string,
  items: InboxItem[],
): InboxItem[] {
  const mineRejected = (i: InboxItem) =>
    i.approvalStatus === "changes_requested" && i.operatorUserId === userId;

  // D170: a maker's approval notification, dismissed the moment they've seen it.
  // D171: self-approval never notifies — a senior approving their own work already knows.
  const mineApprovedUnseen = (i: InboxItem) =>
    i.approvalStatus === "approved" &&
    i.operatorUserId === userId &&
    i.approvedByUserId !== null &&
    i.approvedByUserId !== userId &&
    i.approvedSeenAt === null;

  if (role === "designer") return items.filter((i) => mineRejected(i) || mineApprovedUnseen(i));
  return items.filter(
    (i) => i.approvalStatus === "pending" || mineRejected(i) || mineApprovedUnseen(i),
  );
}

// The SAME rule as selectInboxFor, expressed as a PostgREST `or` filter so the database
// can page it. Filtering in JS after fetching would make every page the wrong size — ask
// for 25 and get 9 back once the role filter runs.
//
// Two expressions of one rule is a real risk, so queue.test.ts asserts they agree over a
// fixture set. If you change one, the test fails until you change the other.
export function inboxFilterFor(role: OrgRole, userId: string): string {
  const mineRejected = `and(approval_status.eq.changes_requested,operator_user_id.eq.${userId})`;
  const mineApprovedUnseen =
    `and(approval_status.eq.approved,operator_user_id.eq.${userId},` +
    `approved_by_user_id.neq.${userId},approved_seen_at.is.null)`;
  if (role === "designer") return `${mineRejected},${mineApprovedUnseen}`;
  return `approval_status.eq.pending,${mineRejected},${mineApprovedUnseen}`;
}
