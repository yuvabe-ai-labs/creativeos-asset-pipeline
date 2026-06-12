import { createServerSupabase } from "@/lib/supabase/server";
import { listVersions } from "@/lib/db/versions";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// GET /api/nodes/:id/versions — return all generate versions + active pointer.
// Powers the Prompt focus view's version history panel.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const supabase = createServerSupabase();
  const { data: node, error: nodeErr } = await supabase
    .from("nodes")
    .select("active_version_id")
    .eq("id", nodeId)
    .maybeSingle();
  if (nodeErr || !node) return apiError("Node not found.", 404);

  const rows = await listVersions(nodeId);

  return apiOk({
    activeVersionId: (node as { active_version_id: string | null }).active_version_id,
    versions: rows.map((v) => ({
      id: v.id,
      output: typeof v.output === "string" ? v.output : null,
      error: v.error,
      modelUsed: v.model_used ?? null,
      paramsUsed: (v.params_used ?? {}) as {
        instruction?: string;
        tokensUsed?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
      },
      createdAt: v.created_at,
    })),
  });
}
