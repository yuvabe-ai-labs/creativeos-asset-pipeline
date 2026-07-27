import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk, withCanvas } from "@/lib/api/route-helpers";

// Real settled credits (generations.credits_charged), not a client-recomputed estimate.
// Legacy generations that predate the credit system have credits_charged = null and simply
// don't contribute — not backfilled.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCanvas(params, async (canvasId) => {
    const supabase = createServerSupabase();

    const { data: nodes, error: nodesErr } = await supabase
      .from("nodes")
      .select("id")
      .eq("canvas_id", canvasId);

    if (nodesErr) return apiError(nodesErr.message, 500);
    if (!nodes || nodes.length === 0) return apiOk({ totalCredits: 0 });

    const nodeIds = nodes.map((n) => n.id);

    const { data, error } = await supabase
      .from("generations")
      .select("credits_charged")
      .in("node_id", nodeIds)
      .eq("status", "succeeded");

    if (error) return apiError(error.message, 500);

    const totalCredits = (data ?? []).reduce(
      (sum, row) => sum + (row.credits_charged ?? 0),
      0,
    );

    return apiOk({ totalCredits });
  });
}
