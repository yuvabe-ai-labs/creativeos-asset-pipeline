import { listVersions } from "@/lib/db/versions";
import { getCreditsChargedByVersionIds } from "@/lib/db/generations";
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
    const creditsByVersion = await getCreditsChargedByVersionIds(rows.map((v) => v.id));

    // D168: resolve maker and reviewer to CURRENT display names in one round trip,
    // reusing the same helper review/queue.ts already uses for the navbar inbox — never
    // a second, drifting implementation of the same lookup.
    const userIds = rows.flatMap((v) => [v.operator_user_id, v.approved_by_user_id]);
    const names = await resolveDisplayNames(
      effectiveOrgId,
      userIds.filter((id): id is string => !!id),
    );

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
        // R11.3/R11.4: current display name, else the legacy free-text fallback, else
        // null. Never the dead `approved_by`/`operator` columns directly (D168) —
        // those degrade only when there is no user reference to resolve.
        makerName: (v.operator_user_id && names.get(v.operator_user_id)) || v.operator || null,
        approvedByName:
          (v.approved_by_user_id && names.get(v.approved_by_user_id)) || null,
        approvedAt: typeof v.approved_at === "string" ? v.approved_at : null,
        inputsUsed: (v.inputs_used ?? {}) as {
          baseVersionId?: string | null;
          instruction?: string;
          intent?: string;
          request?: ModelRequestRecord;
        },
        // Real settled credits (src/lib/db/credit-transactions.ts's ledger) — null for
        // versions that predate the credit system, not backfilled.
        creditsCharged: creditsByVersion.get(v.id) ?? null,
      })),
    });
  });
}
