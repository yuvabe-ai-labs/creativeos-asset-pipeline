import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Edge } from "@xyflow/react";
import { chunkIds, planReconcile } from "./reconcile";

type EdgeRow = {
  id: string;
  canvas_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
  created_at: string;
};

// Convert DB row to React Flow Edge format
function edgeRowToFlow(row: EdgeRow): Edge {
  return {
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    sourceHandle: row.source_handle ?? undefined,
    targetHandle: row.target_handle ?? undefined,
  };
}

export async function listEdges(canvasId: string): Promise<Edge[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("edges")
    .select("*")
    .eq("canvas_id", canvasId);
  if (error) throw error;
  return (data ?? []).map((row) => edgeRowToFlow(row as EdgeRow));
}

// Reconcile DB edges with the current canvas: upsert present, delete ONLY the edges
// the client explicitly removed since load (passed as removedEdgeIds).
export async function saveCanvasEdges(
  canvasId: string,
  edges: Edge[],
  removedEdgeIds: string[] = [],
): Promise<void> {
  const supabase = createServerSupabase();

  if (edges.length > 0) {
    const rows = edges.map((e) => ({
      id: e.id,
      canvas_id: canvasId,
      source_node_id: e.source,
      target_node_id: e.target,
      source_handle: e.sourceHandle ?? null,
      target_handle: e.targetHandle ?? null,
    }));
    const { error } = await supabase.from("edges").upsert(rows);
    if (error) throw error;
  }

  const { deleteIds } = planReconcile(
    edges.map((e) => e.id),
    removedEdgeIds,
  );
  // Chunked: one giant .in() list overflows the gateway's URL limit and the
  // delete silently fails (see saveCanvasNodes).
  for (const chunk of chunkIds(deleteIds)) {
    const { error: delErr } = await supabase
      .from("edges")
      .delete()
      .eq("canvas_id", canvasId)
      .in("id", chunk);
    if (delErr) throw delErr;
  }
}
