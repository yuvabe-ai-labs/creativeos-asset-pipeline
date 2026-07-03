import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  mapEvalTraces,
  type EvalTrace,
  type EvalNodeRow,
  type EvalVersionRow,
} from "@/lib/eval/map-traces";

import {
  mapNodeTraces,
  GENERATED_TYPES,
  type NodeTrace,
  type TraceNodeRow,
  type TraceVersionRow,
} from "@/lib/eval/node-traces";

export type { EvalTrace } from "@/lib/eval/map-traces";
export type { NodeTrace } from "@/lib/eval/node-traces";

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

// The error-analysis dataset: every generated node on a canvas + ALL its versions
// (D4 "a node = one task"; D18 versions = attempts). Production later swaps the
// filter to a client. Pure shaping happens in mapNodeTraces.
export async function listNodeTraces(canvasId: string): Promise<NodeTrace[]> {
  const supabase = createServerSupabase();

  const { data: nodes, error: nErr } = await supabase
    .from("nodes")
    .select("id, type, data, active_version_id")
    .eq("canvas_id", canvasId)
    .in("type", GENERATED_TYPES);
  if (nErr) throw nErr;

  const nodeRows = (nodes ?? []) as TraceNodeRow[];
  const nodeIds = nodeRows.map((n) => n.id);
  if (nodeIds.length === 0) return [];

  const { data: versions, error: vErr } = await supabase
    .from("node_versions")
    .select("id, node_id, created_at, inputs_used, params_used, generated_output, output, decision, note")
    .in("node_id", nodeIds);
  if (vErr) throw vErr;

  return mapNodeTraces(nodeRows, (versions ?? []) as TraceVersionRow[]);
}
