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
import { insertDecision } from "@/lib/db/decisions";
import { randomUUID } from "crypto";
import { validateAnnotations, type AnnotationPayload } from "@/lib/review-annotations/payload";
import { uploadAnnotationAssets } from "@/lib/review-annotations/storage";
import { insertAnnotations } from "@/lib/db/annotations";

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
  input: {
    status: ApprovalStatus;
    note?: string | null;
    // D211/D212: region+note pairs, only with changes_requested. Validated and
    // uploaded BEFORE any DB write — a failure aborts the whole action (D214).
    annotations?: AnnotationPayload[];
  },
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

    const annotations = input.annotations ?? [];
    if (annotations.length > 0 && input.status !== "changes_requested") {
      throw new Error("Annotations can only be attached when you request changes.");
    }
    if (annotations.length > 0) {
      const invalid = validateAnnotations(annotations);
      if (invalid) throw new Error(invalid);
    }

    const supabase = createServerSupabase();

    // Tenancy, not just role: a senior of org A must not be able to annotate org B's
    // work by guessing a version id. 404-shaped message (never "wrong org"), matching
    // the withClient/withNode 404-not-403 convention in route-helpers.ts.
    const { data: version, error: readErr } = await supabase
      .from("node_versions")
      .select("id, org_id, node_id")
      .eq("id", versionId)
      .maybeSingle();
    if (readErr) throw readErr;
    const versionRow = version as { org_id: string | null; node_id: string | null } | null;
    if (!versionRow || versionRow.org_id !== caller.orgId) {
      throw new Error("Version not found.");
    }

    const at = new Date().toISOString();
    const update = buildApprovalUpdate({
      status: input.status,
      by: caller.userId,
      at,
      note,
    });

    // The decision id is pre-generated so asset paths can reference it (D214).
    const decisionId = randomUUID();
    let uploaded: { seq: number; maskPath: string; framePath: string | null }[] = [];
    if (annotations.length > 0) {
      if (!versionRow.node_id) throw new Error("Version not found.");
      // Assets land in GCS under the node they annotate, via the same lib/storage module
      // every generated asset uses (D217) — not a separate Supabase bucket.
      uploaded = await uploadAnnotationAssets(
        versionRow.node_id,
        decisionId,
        annotations,
      );
    }

    const { error } = await supabase
      .from("node_versions")
      .update(update)
      .eq("id", versionId);
    if (error) throw error;

    // D173/D175: append-only decision history, best-effort. A logging failure must never
    // block or fail the approve/reject action the reviewer just performed — the status
    // update above already succeeded and is the source of truth; this is observability.
    if (input.status === "approved" || input.status === "changes_requested") {
      const writeDecision = () =>
        insertDecision({
          id: decisionId,
          versionId,
          orgId: caller.orgId,
          status: input.status as "approved" | "changes_requested",
          note,
          decidedByUserId: caller.userId,
          decidedAt: at,
        });
      if (annotations.length > 0) {
        // Strict: the annotation rows reference this decision id — losing the decision
        // row would orphan the feedback the senior just wrote (D214).
        await writeDecision();
        await insertAnnotations(
          annotations.map((a) => {
            const stored = uploaded.find((u) => u.seq === a.seq);
            if (!stored) throw new Error(`No uploaded asset for annotation ${a.seq}.`);
            return {
              decision_id: decisionId,
              org_id: caller.orgId,
              seq: a.seq,
              kind: a.kind,
              timecode_ms: a.timecodeMs,
              frame_path: stored.framePath,
              mask_path: stored.maskPath,
              note: a.note.trim(),
              bounds: a.bounds,
            };
          }),
        );
      } else {
        // D173/D175: history logging stays best-effort when it is pure observability.
        try {
          await writeDecision();
        } catch (e) {
          console.error("Failed to log approval decision history", e);
        }
      }
    }
  });
}

// D170: a maker's approval notification is a dismiss-on-view read receipt. Called
// fire-and-forget from the node's own focus view when its active version is approved
// (Task 9) — the maker's mirror of ?review=1 landing a reviewer on the node (R9.3).
//
// Deliberately silent rather than throwing on "not applicable" conditions: wrong caller,
// wrong status, or already seen are not errors, they are simply "nothing to do here" —
// this is a read receipt, not a security boundary that should surface failures to a
// fire-and-forget caller.
export async function markVersionApprovalSeenAction(versionId: string): Promise<void> {
  return withAction("markVersionApprovalSeenAction", async () => {
    const caller = await resolveCallerContext();
    const supabase = createServerSupabase();

    const { data: version, error: readErr } = await supabase
      .from("node_versions")
      .select("id, operator_user_id, approval_status, approved_seen_at")
      .eq("id", versionId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!version) return;

    const row = version as {
      operator_user_id: string | null;
      approval_status: string;
      approved_seen_at: string | null;
    };
    if (row.operator_user_id !== caller.userId) return;
    if (row.approval_status !== "approved") return;
    if (row.approved_seen_at !== null) return;

    const { error } = await supabase
      .from("node_versions")
      .update({ approved_seen_at: new Date().toISOString() })
      .eq("id", versionId);
    if (error) throw error;
  });
}
