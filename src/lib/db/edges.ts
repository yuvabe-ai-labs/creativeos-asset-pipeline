import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Edge } from "@xyflow/react";

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

// Reconcile DB edges with current canvas edges — upsert present, delete removed.
export async function saveCanvasEdges(
  canvasId: string,
  edges: Edge[],
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

  const ids = edges.map((e) => e.id);
  const base = supabase.from("edges").delete().eq("canvas_id", canvasId);
  const { error: delErr } = ids.length
    ? await base.not("id", "in", `(${ids.join(",")})`)
    : await base;
  if (delErr) throw delErr;
}
