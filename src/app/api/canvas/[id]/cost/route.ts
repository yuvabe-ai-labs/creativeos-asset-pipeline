import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { USD_TO_INR } from "@/lib/pricing";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: canvasId } = await params;

  const supabase = createServerSupabase();

  const { data: nodes, error: nodesErr } = await supabase
    .from("nodes")
    .select("id")
    .eq("canvas_id", canvasId);

  if (nodesErr) return apiError(nodesErr.message, 500);
  if (!nodes || nodes.length === 0) return apiOk({ totalUsd: 0, totalInr: 0 });

  const nodeIds = nodes.map((n) => n.id);

  const { data, error } = await supabase
    .from("generations")
    .select("credits_consumed")
    .in("node_id", nodeIds)
    .eq("status", "succeeded");

  if (error) return apiError(error.message, 500);

  const totalUsd = (data ?? []).reduce(
    (sum, row) => sum + (row.credits_consumed ?? 0),
    0,
  );

  return apiOk({ totalUsd, totalInr: totalUsd * USD_TO_INR });
}
