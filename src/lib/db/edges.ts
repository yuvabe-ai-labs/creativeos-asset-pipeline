import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Edge } from "@xyflow/react";
import { chunkIds, planReconcile } from "./reconcile";
import { edgeRowToFlow, flowEdgeToRow, type EdgeRow } from "./edge-rows";

// The row<->Edge conversion lives in ./edge-rows so there is exactly one definition of it.
// It used to be inlined here AND hand-written a third time in /api/nodes/duplicate-batch,
// where it was written with React Flow's field names instead of the column names — which
// failed every batch duplicate of a selection containing an edge.

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
    const rows = edges.map((e) => flowEdgeToRow(canvasId, e));
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
