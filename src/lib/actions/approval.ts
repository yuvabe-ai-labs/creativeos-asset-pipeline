"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { buildApprovalUpdate, type ApprovalStatus } from "@/lib/approval";

// D29: set the approval flag on a SPECIFIC version (the caller passes the node's active
// version id). Annotates an attempt — never a new attempt — so no new version row, mirroring
// setVersionLabelAction (D18). Distinct field from `decision`; never touches it.
export async function setVersionApprovalAction(
  versionId: string,
  input: { status: ApprovalStatus; approvedBy: string | null; note?: string | null },
) {
  const supabase = createServerSupabase();
  const update = buildApprovalUpdate({
    status: input.status,
    by: input.approvedBy,
    at: new Date().toISOString(),
    note: input.note ?? null,
  });
  const { error } = await supabase
    .from("node_versions")
    .update(update)
    .eq("id", versionId);
  if (error) throw error;
}
