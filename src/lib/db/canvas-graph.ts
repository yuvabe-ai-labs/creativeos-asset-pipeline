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
