import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  mapEvalTraces,
  type EvalTrace,
  type EvalNodeRow,
  type EvalVersionRow,
} from "@/lib/eval/map-traces";

export type { EvalTrace } from "@/lib/eval/map-traces";

// The eval "dataset" is a query ACROSS nodes (the 20-node model), here filtered to one
// eval canvas; production swaps the filter (client / edit-diff). Pure shaping → mapEvalTraces.
export async function listEvalTraces(canvasId: string): Promise<EvalTrace[]> {
  const supabase = createServerSupabase();

  const { data: nodes, error: nErr } = await supabase
    .from("nodes")
    .select("id, data, active_version_id")
    .eq("canvas_id", canvasId)
    .eq("type", "prompt");
  if (nErr) throw nErr;

  const nodeRows = (nodes ?? []) as EvalNodeRow[];
  const activeIds = nodeRows
    .map((n) => n.active_version_id)
    .filter((id): id is string => !!id);
  if (activeIds.length === 0) return [];

  const { data: versions, error: vErr } = await supabase
    .from("node_versions")
    .select("id, inputs_used, generated_output, output, decision, note")
    .in("id", activeIds);
  if (vErr) throw vErr;

  return mapEvalTraces(nodeRows, (versions ?? []) as EvalVersionRow[]);
}
