import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { USD_TO_INR } from "@/lib/pricing";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("credits_consumed")
    .eq("node_id", nodeId)
    .eq("status", "succeeded");

  if (error) return apiError(error.message, 500);

  const totalUsd = (data ?? []).reduce(
    (sum, row) => sum + (row.credits_consumed ?? 0),
    0,
  );

  return apiOk({ totalUsd, totalInr: totalUsd * USD_TO_INR });
}
