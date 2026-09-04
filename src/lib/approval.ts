import type { OrgRole } from "@/lib/dal-logic";

// D29: pure computation of the approval update payload from an action. Kept separate
// from the server action (which does the Supabase write) so it is unit-testable, the
// same split as planReconcile. `at` is injected (ISO string) for deterministic tests.
export type ApprovalStatus = "pending" | "approved" | "changes_requested";

// R2.1: only owner/senior may set approval_status. Matches the existing
// orgRoleToIdentityRole collapse (owner is treated as senior everywhere) — only
// `designer` is restricted.
//
// This is the PREDICATE ONLY. Enforcement lives in setVersionApprovalAction, which
// resolves the caller server-side (D166); keeping the rule pure means it is testable
// without a session, and means there is exactly one place the rule is written down.
export function canSetApproval(orgRole: OrgRole): boolean {
  return orgRole === "owner" || orgRole === "senior";
}

// R6.5: a rejection with no explanation is not useful to the maker it routes back to,
// so a note is required for changes_requested — and meaningless for the other two
// states, which buildApprovalUpdate already nulls it for.
export function requiresNote(status: ApprovalStatus): boolean {
  return status === "changes_requested";
}

export type ApprovalUpdate = {
  approval_status: ApprovalStatus;
  // R11.2: the REVIEWER as a real user reference. The legacy `approved_by` text column
  // is never written again — reads resolve this id to a current display name and fall
  // back to the old string for pre-migration rows (R11.4).
  approved_by_user_id: string | null;
  approved_at: string | null;
  // Per-approval read receipt, not permanent-per-row: every status transition clears it
  // so a fresh approval is always unseen by the maker, even after a prior approval had
  // already been marked seen.
  approved_seen_at: string | null;
  note: string | null;
};

// D173: the shape the versions API route returns per logged decision — reused by both
// version-history panels and their shared VersionDecisionThread component, so the field
// names are written down in exactly one place.
// D213/D214: one region+note pair as the versions route serves it — asset paths already
// resolved to short-lived signed URLs, null when signing failed (the note still reads).
export type DecisionAnnotationSummary = {
  id: string;
  seq: number;
  kind: "image" | "video-frame";
  timecodeMs: number | null;
  note: string;
  // D218: where the region sits, as fractions of the media's natural size. Null on rows
  // written before D218 — the reader falls back to a left-edge pin stack.
  bounds: { x: number; y: number; w: number; h: number } | null;
  maskUrl: string | null;
};

export type VersionDecisionSummary = {
  // The log row's own id. Carried so the thread can key on it: the list grows at the HEAD
  // (newest first), so an array index would re-key every existing entry on each new
  // decision.
  id: string;
  status: "approved" | "changes_requested";
  note: string | null;
  reviewerName: string | null;
  decidedAt: string;
  // Absent on every decision made before D213, and on approvals (annotations attach
  // only to changes_requested, D212).
  annotations?: DecisionAnnotationSummary[];
};

export function buildApprovalUpdate(input: {
  status: ApprovalStatus;
  by: string | null; // the caller's user id — never a display name, never client-supplied
  at: string;
  note?: string | null;
}): ApprovalUpdate {
  // Reset to pending clears attribution and feedback — the version is un-reviewed again.
  if (input.status === "pending") {
    return {
      approval_status: "pending",
      approved_by_user_id: null,
      approved_at: null,
      approved_seen_at: null,
      note: null,
    };
  }
  return {
    approval_status: input.status,
    approved_by_user_id: input.by,
    approved_at: input.at,
    approved_seen_at: null,
    // note is feedback for the maker — only meaningful for changes_requested.
    note: input.status === "changes_requested" ? (input.note ?? null) : null,
  };
}
