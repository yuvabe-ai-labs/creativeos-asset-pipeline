"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { resolveCallerContext } from "@/lib/dal";
import {
  buildApprovalUpdate,
  canSetApproval,
  requiresNote,
  type ApprovalStatus,
} from "@/lib/approval";
import { withAction } from "@/lib/actions/with-action";

// D29/D166: set the approval flag on a SPECIFIC version (the caller passes the node's
// active version id). Annotates an attempt — never a new attempt — so no new version
// row, mirroring setVersionLabelAction (D18). Distinct field from `decision`; never
// touches it.
//
// The `approvedBy` parameter is GONE by design. It used to arrive from the client, which
// meant the server recorded whatever identity the browser claimed. A role check bolted
// onto a caller-supplied identity is not enforcement — so the reviewer is resolved from
// the session, and the parameter no longer exists to be spoofed (R2.1, D166).
export async function setVersionApprovalAction(
  versionId: string,
  input: { status: ApprovalStatus; note?: string | null },
) {
  return withAction("setVersionApprovalAction", async () => {
    const caller = await resolveCallerContext();

    // R2.1/R2.2 — the role gate, against the caller's REAL org role. Checked before any
    // read: a designer should not be able to probe which version ids exist. The UI also
    // hides the control from them, but that is a courtesy on top of this, never the
    // mechanism (R2.3).
    if (!canSetApproval(caller.orgRole)) {
      throw new Error("You are not permitted to approve or reject work.");
    }

    // R6.5 — enforced here, not merely disabled in the UI. A rejection with no
    // explanation is not useful to the maker it routes back to.
    const note = input.note?.trim() || null;
    if (requiresNote(input.status) && !note) {
      throw new Error("A note is required when requesting changes.");
    }

    const supabase = createServerSupabase();

    // Tenancy, not just role: a senior of org A must not be able to annotate org B's
    // work by guessing a version id. 404-shaped message (never "wrong org"), matching
    // the withClient/withNode 404-not-403 convention in route-helpers.ts.
    const { data: version, error: readErr } = await supabase
      .from("node_versions")
      .select("id, org_id")
      .eq("id", versionId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!version || (version as { org_id: string | null }).org_id !== caller.orgId) {
      throw new Error("Version not found.");
    }

    const update = buildApprovalUpdate({
      status: input.status,
      by: caller.userId,
      at: new Date().toISOString(),
      note,
    });

    const { error } = await supabase
      .from("node_versions")
      .update(update)
      .eq("id", versionId);
    if (error) throw error;
  });
}
