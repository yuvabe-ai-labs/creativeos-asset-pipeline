import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { USD_TO_INR } from "@/lib/pricing";

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
      .select("credits_consumed")
      .in("node_id", allNodeIds)
      .eq("status", "succeeded");

    if (error) return apiError(error.message, 500);

    const totalUsd = (data ?? []).reduce(
      (sum, row) => sum + (row.credits_consumed ?? 0),
      0,
    );

    return apiOk({ totalUsd, totalInr: totalUsd * USD_TO_INR });
  });
}
