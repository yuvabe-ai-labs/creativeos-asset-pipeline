import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk, withCanvas } from "@/lib/api/route-helpers";
import { tallyCanvasCost } from "@/lib/credits/canvas-cost";

// Real settled credits (generations.credits_charged), not a client-recomputed estimate.
// Legacy generations that predate the credit system have credits_charged = null and simply
// don't contribute — not backfilled.
//
// Returns the per-node breakdown alongside the total, so every cost figure on the canvas —
// the header chip, the node footers, the focus views' Usage popovers — reads from this one
// response instead of each firing its own request.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withCanvas(req, params, async (canvasId) => {
    const supabase = createServerSupabase();

    const { data: nodes, error: nodesErr } = await supabase
      .from("nodes")
      .select("id")
      .eq("canvas_id", canvasId);

    if (nodesErr) return apiError(nodesErr.message, 500);
    if (!nodes || nodes.length === 0) return apiOk({ totalCredits: 0, byNode: {} });

    const nodeIds = nodes.map((n) => n.id);

    const { data, error } = await supabase
      .from("generations")
      .select("node_id, credits_charged")
      .in("node_id", nodeIds)
      .eq("status", "succeeded");

    if (error) return apiError(error.message, 500);

    return apiOk(tallyCanvasCost(data ?? []));
  });
}
