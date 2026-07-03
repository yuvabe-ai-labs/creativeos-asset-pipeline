// D29: pure computation of the approval update payload from an action. Kept separate
// from the server action (which does the Supabase write) so it is unit-testable, the
// same split as planReconcile. `at` is injected (ISO string) for deterministic tests.
export type ApprovalStatus = "pending" | "approved" | "changes_requested";

export type ApprovalUpdate = {
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  note: string | null;
};

export function buildApprovalUpdate(input: {
  status: ApprovalStatus;
  by: string | null;
  at: string;
  note?: string | null;
}): ApprovalUpdate {
  // Reset to pending clears attribution and feedback — the version is un-reviewed again.
  if (input.status === "pending") {
    return { approval_status: "pending", approved_by: null, approved_at: null, note: null };
  }
  return {
    approval_status: input.status,
    approved_by: input.by,
    approved_at: input.at,
    // note is feedback for the maker — only meaningful for changes_requested.
    note: input.status === "changes_requested" ? (input.note ?? null) : null,
  };
}
