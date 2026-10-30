// Single-row canvas writes for server-side canvas changes the editor asks for (D406): one node,
// edges, one edge removed. The canvas page's own autosave stays the way it is.
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type GraphNode = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };

export async function getCanvasNode(canvasId: string, nodeId: string): Promise<GraphNode | null> {
  const { data, error } = await createServerSupabase().from("nodes").select("id, type, position, data").eq("canvas_id", canvasId).eq("id", nodeId).maybeSingle();
  if (error) throw error;
  return (data as GraphNode | null) ?? null;
}

export async function insertCanvasNode(canvasId: string, node: GraphNode): Promise<void> {
  const { error } = await createServerSupabase().from("nodes").insert({ id: node.id, canvas_id: canvasId, type: node.type, position: node.position, data: node.data });
  if (error) throw error;
}

export async function insertCanvasEdges(canvasId: string, edges: Array<{ id: string; source: string; target: string }>): Promise<void> {
  const { error } = await createServerSupabase()
    .from("edges")
    .insert(edges.map((e) => ({ id: e.id, canvas_id: canvasId, source_node_id: e.source, target_node_id: e.target, source_handle: null, target_handle: null })));
  if (error) throw error;
}

export async function deleteCanvasEdge(canvasId: string, edgeId: string): Promise<void> {
  const { error } = await createServerSupabase().from("edges").delete().eq("canvas_id", canvasId).eq("id", edgeId);
  if (error) throw error;
}

/**
 * D454 — new nodes that arrive with a first version already made (Fan out's storyboard
 * Composites, whose v1 is the panel): the nodes, their versions in one insert, then each node's
 * active pointer. A failed version insert removes the nodes again, so none is left with nothing.
 */
export async function insertNodesWithFirstVersions(
  canvasId: string,
  entries: Array<{ node: GraphNode; version: { output: string; inputsUsed: Record<string, unknown>; paramsUsed: Record<string, unknown>; modelUsed: string | null } }>,
  operatorUserId: string,
): Promise<void> {
  if (entries.length === 0) return;
  const supabase = createServerSupabase();
  const ids = entries.map((e) => e.node.id);
  const { error: nodeErr } = await supabase.from("nodes").insert(
    entries.map(({ node }) => ({ id: node.id, canvas_id: canvasId, type: node.type, position: node.position, data: node.data, active_version_id: null })),
  );
  if (nodeErr) throw nodeErr;
  const { data: versions, error: versionErr } = await supabase
    .from("node_versions")
    .insert(entries.map(({ node, version }) => ({
      node_id: node.id,
      inputs_used: version.inputsUsed,
      params_used: version.paramsUsed,
      model_used: version.modelUsed,
      output: version.output,
      generated_output: version.output,
      operator_user_id: operatorUserId,
    })))
    .select("id, node_id");
  if (versionErr || !versions) {
    await supabase.from("nodes").delete().eq("canvas_id", canvasId).in("id", ids);
    throw versionErr ?? new Error("No versions written.");
  }
  const results = await Promise.all(
    (versions as { id: string; node_id: string }[]).map((v) =>
      supabase.from("nodes").update({ active_version_id: v.id }).eq("id", v.node_id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
