import { listVersions } from "@/lib/db/versions";
import { getCreditsChargedByVersionIds } from "@/lib/db/generations";
import type { ModelRequestRecord } from "@/lib/nodes/model-request";
import { apiOk, withNode } from "@/lib/api/route-helpers";

// GET /api/nodes/:id/versions — return all generate versions + active pointer.
// Powers the Prompt focus view's version history panel.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId, node) => {
    const rows = await listVersions(nodeId);
    const creditsByVersion = await getCreditsChargedByVersionIds(rows.map((v) => v.id));

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
        approvedBy: typeof v.approved_by === "string" ? v.approved_by : null,
        approvedAt: typeof v.approved_at === "string" ? v.approved_at : null,
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
