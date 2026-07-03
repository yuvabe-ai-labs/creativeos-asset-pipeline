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
  type ResolvedUpstream,
} from "@/lib/eval/node-traces";
import { getNodeOutput } from "@/lib/nodes/node-output";

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

  const upstreamByNode = await resolveUpstreamInputs(nodeIds);
  return mapNodeTraces(nodeRows, (versions ?? []) as TraceVersionRow[], upstreamByNode);
}

// An image source contributes its URL to `images`; everything else renders to `text`.
function upstreamImageUrl(type: string, data: Record<string, unknown>, activeOutput: unknown): string | undefined {
  if (type === "image-gen" && typeof activeOutput === "string") return activeOutput;
  const fileUrl = typeof data.fileUrl === "string" ? data.fileUrl : undefined;
  if (type === "draw" && fileUrl) return fileUrl;
  if (type === "file" && data.fileKind === "image" && fileUrl) return fileUrl;
  return undefined;
}

// Resolve each node's LIVE upstream input (capture-independent), so panel A works for
// every node type + version even when the version froze no shotText/request. Batched:
// one edges query + one source-nodes query, then rendered via getNodeOutput.
async function resolveUpstreamInputs(nodeIds: string[]): Promise<Map<string, ResolvedUpstream>> {
  const result = new Map<string, ResolvedUpstream>();
  if (nodeIds.length === 0) return result;
  const supabase = createServerSupabase();

  const { data: edges, error: eErr } = await supabase
    .from("edges")
    .select("source_node_id, target_node_id")
    .in("target_node_id", nodeIds);
  if (eErr) throw eErr;
  const edgeRows = (edges ?? []) as { source_node_id: string; target_node_id: string }[];
  const sourceIds = [...new Set(edgeRows.map((e) => e.source_node_id))];
  if (sourceIds.length === 0) return result;

  const { data: sources, error: sErr } = await supabase
    .from("nodes")
    .select("id, type, data, active:node_versions!nodes_active_version_fk(output)")
    .in("id", sourceIds);
  if (sErr) throw sErr;

  const srcById = new Map<string, { type: string; data: Record<string, unknown>; activeOutput: unknown }>();
  for (const s of (sources ?? []) as unknown as {
    id: string; type: string; data: Record<string, unknown> | null; active: { output: unknown } | null;
  }[]) {
    srcById.set(s.id, { type: s.type, data: s.data ?? {}, activeOutput: s.active?.output ?? null });
  }

  for (const targetId of nodeIds) {
    const texts: string[] = [];
    const images: string[] = [];
    for (const e of edgeRows) {
      if (e.target_node_id !== targetId) continue;
      const src = srcById.get(e.source_node_id);
      if (!src) continue;
      const img = upstreamImageUrl(src.type, src.data, src.activeOutput);
      if (img) images.push(img);
      const t = getNodeOutput({ type: src.type, data: src.data, activeOutput: src.activeOutput });
      if (t && t !== img) texts.push(t);
    }
    if (texts.length || images.length) result.set(targetId, { text: texts.join("\n\n"), images });
  }
  return result;
}
