import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { NodeWithActive } from "@/lib/canvas-nodes";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { getActiveKBVersion } from "./kb";

// What the client sends us to persist (React Flow node, trimmed to DB columns).
export type PersistedNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

// Resolve a node's client's active KB by walking node -> canvas -> client ->
// active_kb_version_id -> client_kb_versions.output.
// Returns null when the node (or its canvas) is missing (lets the route 404 +
// hint a retry during the autosave race). A node whose client has no active KB
// returns { kb: null } — not normally reachable, since the canvas-list page
// redirects to /kb unless kb_status === 'ready'.
export async function getNodeActiveKB(
  nodeId: string,
): Promise<{ kb: TraceableBrandKB | null; kbVersionId: string | null } | null> {
  const supabase = createServerSupabase();

  const { data: node, error: nodeErr } = await supabase
    .from("nodes")
    .select("canvas_id")
    .eq("id", nodeId)
    .maybeSingle();
  if (nodeErr) throw nodeErr;
  if (!node) return null;

  const { data: canvas, error: canvasErr } = await supabase
    .from("canvases")
    .select("client_id")
    .eq("id", (node as { canvas_id: string }).canvas_id)
    .maybeSingle();
  if (canvasErr) throw canvasErr;
  if (!canvas) return null; // dangling node (no canvas row) — treat as not found

  const versionRow = await getActiveKBVersion(
    (canvas as { client_id: string }).client_id,
  );
  if (!versionRow) return { kb: null, kbVersionId: null };
  return {
    kb: versionRow.output as unknown as TraceableBrandKB,
    kbVersionId: versionRow.id,
  };
}

export async function listNodes(canvasId: string): Promise<NodeWithActive[]> {
  const supabase = createServerSupabase();
  // Embed the active version's output via the nodes.active_version_id FK
  // (constraint name disambiguates it from node_versions.node_id).
  const { data, error } = await supabase
    .from("nodes")
    .select("*, active:node_versions!nodes_active_version_fk(output)")
    .eq("canvas_id", canvasId);
  if (error) throw error;
  return (data ?? []) as unknown as NodeWithActive[];
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
