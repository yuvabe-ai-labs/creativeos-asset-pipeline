import { listVersions } from "@/lib/db/versions";
import { getCreditsChargedByVersionIds } from "@/lib/db/generations";
import { getDecisionsByVersionIds } from "@/lib/db/decisions";
import { resolveDisplayNames } from "@/lib/db/profiles";
import type { ModelRequestRecord } from "@/lib/nodes/model-request";
import { apiOk, withNode } from "@/lib/api/route-helpers";

// GET /api/nodes/:id/versions — return all generate versions + active pointer.
// Powers the Prompt focus view's version history panel.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId, node, _caller, _clientId, effectiveOrgId) => {
    const rows = await listVersions(nodeId);
    const versionIds = rows.map((v) => v.id);
    const creditsByVersion = await getCreditsChargedByVersionIds(versionIds);
    // D173: the full decision log for every version on this node, one batched query.
    const decisionsByVersion = await getDecisionsByVersionIds(versionIds);

    // D168: resolve maker and reviewer to CURRENT display names in one round trip,
    // reusing the same helper review/queue.ts already uses for the navbar inbox — never
    // a second, drifting implementation of the same lookup. D173 extends this ONE call to
    // also cover every decision's reviewer, rather than a second name-resolution pass.
    const decisionReviewerIds = [...decisionsByVersion.values()]
      .flat()
      .map((d) => d.decided_by_user_id)
      .filter((id): id is string => !!id);
    const userIds = [
      ...rows.flatMap((v) => [v.operator_user_id, v.approved_by_user_id]),
      ...decisionReviewerIds,
    ].filter((id): id is string => !!id);
    const names = await resolveDisplayNames(effectiveOrgId, userIds);

    return apiOk({
      activeVersionId: node.active_version_id,
      versions: rows.map((v) => ({
        id: v.id,
        output: typeof v.output === "string" ? v.output : null,
        // D22: the model's frozen raw output. Lets Step 3's viewer render the
        // generated -> shipped diff (generatedOutput vs output).
        generatedOutput: typeof v.generated_output === "string" ? v.generated_output : null,
        error: v.error,
        modelUsed: v.model_used ?? null,
        paramsUsed: (v.params_used ?? {}) as {
          instruction?: string;
          tokensUsed?: Record<string, number> | null;
        },
        createdAt: v.created_at,
        decision: (v.decision as "pass" | "fail" | null) ?? null,
        note: typeof v.note === "string" ? v.note : null,
        // D29 approval flag (distinct from decision).
        approvalStatus: v.approval_status as "pending" | "approved" | "changes_requested",
        // R11.3/R11.4: makerName is current display name, else the legacy free-text
        // `operator` fallback, else null. approvedByName has no legacy fallback — there
        // is no reliable historical string for the reviewer (`approved_by` was never
        // meaningfully populated before the real user-reference migration, unlike
        // `operator`), so it resolves straight to null. Never the dead `approved_by`/
        // `operator` columns directly (D168) — those degrade only when there is no user
        // reference to resolve.
        makerName: (v.operator_user_id && names.get(v.operator_user_id)) || v.operator || null,
        approvedByName:
          (v.approved_by_user_id && names.get(v.approved_by_user_id)) || null,
        approvedAt: typeof v.approved_at === "string" ? v.approved_at : null,
        // D173: full decision history, newest first — getDecisionsByVersionIds already
        // orders it, this is a straight map, not a re-sort.
        decisions: (decisionsByVersion.get(v.id) ?? []).map((d) => ({
          id: d.id,
          status: d.status,
          note: d.note,
          reviewerName: (d.decided_by_user_id && names.get(d.decided_by_user_id)) || null,
          decidedAt: d.decided_at,
        })),
        // One column, two shapes: the LLM-backed nodes write the `request` envelope, while
        // video-gen writes the resolved prompt + image roles its provider call was built from
        // (src/app/api/nodes/[id]/video-generate/route.ts). Both are frozen at generate time and
        // both are read here — the video-gen focus view's "Sent to model" pane needs the latter.
        inputsUsed: (v.inputs_used ?? {}) as {
          baseVersionId?: string | null;
          instruction?: string;
          intent?: string;
          request?: ModelRequestRecord;
          prompt?: string;
          startFrameUrl?: string | null;
          endFrameUrl?: string | null;
          referenceUrls?: string[];
        },
        // Real settled credits (src/lib/db/credit-transactions.ts's ledger) — null for
        // versions that predate the credit system, not backfilled.
        creditsCharged: creditsByVersion.get(v.id) ?? null,
      })),
    });
  });
}
