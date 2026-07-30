import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

// Real settled credits (generations.credits_charged), not a client-recomputed estimate.
// Legacy generations that predate the credit system have credits_charged = null and simply
// don't contribute — not backfilled.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(params, async (nodeId) => {
    // ?also=id1,id2,... lets callers include upstream pipeline node IDs so the
    // badge reflects the full cost of reaching this generation, not just this node.
    const { searchParams } = new URL(req.url);
    const alsoRaw = searchParams.get("also") ?? "";
    const extraIds = alsoRaw ? alsoRaw.split(",").filter(Boolean) : [];
    const allNodeIds = [nodeId, ...extraIds];

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("generations")
      .select("credits_charged")
      .in("node_id", allNodeIds)
      .eq("status", "succeeded");

    if (error) return apiError(error.message, 500);

    const totalCredits = (data ?? []).reduce(
      (sum, row) => sum + (row.credits_charged ?? 0),
      0,
    );

    return apiOk({ totalCredits });
  });
}
