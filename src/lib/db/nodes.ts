import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { NodeRow } from "./types";

// What the client sends us to persist (React Flow node, trimmed to DB columns).
export type PersistedNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

// Ambient client context for a node — walk node → canvas → client in one query.
export async function getNodeClientContext(
  nodeId: string,
): Promise<{ contextNotes: string } | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nodes")
    .select("id, canvases(clients(context_notes))")
    .eq("id", nodeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    canvases?: { clients?: { context_notes?: string } | null } | null;
  };
  return { contextNotes: row.canvases?.clients?.context_notes ?? "" };
}

export async function listNodes(canvasId: string): Promise<NodeRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .eq("canvas_id", canvasId);
  if (error) throw error;
  return (data ?? []) as NodeRow[];
}

// Reconcile the DB with the current canvas: upsert everything present, delete
// anything that's no longer there. (Simple whole-canvas save — fine at MVP size.)
export async function saveCanvasNodes(
  canvasId: string,
  nodes: PersistedNode[],
): Promise<void> {
  const supabase = createServerSupabase();

  if (nodes.length > 0) {
    const rows = nodes.map((n) => ({
      id: n.id,
      canvas_id: canvasId,
      type: n.type,
      position: n.position,
      data: n.data,
    }));
    const { error } = await supabase.from("nodes").upsert(rows); // on conflict (id)
    if (error) throw error;
  }

  // delete nodes that exist in the DB but were removed on the canvas
  const ids = nodes.map((n) => n.id);
  const base = supabase.from("nodes").delete().eq("canvas_id", canvasId);
  const { error: delErr } = ids.length
    ? await base.not("id", "in", `(${ids.join(",")})`)
    : await base; // none left → delete all for this canvas
  if (delErr) throw delErr;
}
