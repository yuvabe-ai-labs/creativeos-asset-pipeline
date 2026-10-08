import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

// D299 — the database reads behind "the presenter of a shot".

/** A node's client and its own data — the client to read the avatar under, and the prompt
 *  node's stored presenter switch. Null for a missing or dangling node. */
export async function getNodeClientAndData(
  nodeId: string,
): Promise<{ clientId: string; data: Record<string, unknown> } | null> {
  const supabase = createServerSupabase();
  const { data: node, error: nodeErr } = await supabase
    .from("nodes")
    .select("canvas_id, data")
    .eq("id", nodeId)
    .maybeSingle();
  if (nodeErr) throw nodeErr;
  if (!node) return null;
  const row = node as { canvas_id: string; data: Record<string, unknown> | null };

  const { data: canvas, error: canvasErr } = await supabase
    .from("canvases")
    .select("client_id")
    .eq("id", row.canvas_id)
    .maybeSingle();
  if (canvasErr) throw canvasErr;
  if (!canvas) return null;
  return { clientId: (canvas as { client_id: string }).client_id, data: row.data ?? {} };
}

/** The script's presenter: the newest edge into it from an Avatar node (D298 — one presenter;
 *  if older data left several, the newest wins), with the avatar id that node holds. */
export async function getScriptPresenterSource(
  scriptNodeId: string,
): Promise<{ avatarNodeId: string; avatarId: string } | null> {
  const supabase = createServerSupabase();
  const { data: edges, error: edgeErr } = await supabase
    .from("edges")
    .select("source_node_id")
    .eq("target_node_id", scriptNodeId)
    .order("created_at", { ascending: false });
  if (edgeErr) throw edgeErr;
  const sourceIds = ((edges ?? []) as { source_node_id: string }[]).map((e) => e.source_node_id);
  if (sourceIds.length === 0) return null;

  const { data: nodes, error: nodeErr } = await supabase
    .from("nodes")
    .select("id, data")
    .in("id", sourceIds)
    .eq("type", "avatar");
  if (nodeErr) throw nodeErr;
  const byId = new Map(((nodes ?? []) as { id: string; data: Record<string, unknown> | null }[]).map((n) => [n.id, n]));

  for (const id of sourceIds) {
    const avatarId = byId.get(id)?.data?.avatarId;
    if (typeof avatarId === "string" && avatarId) return { avatarNodeId: id, avatarId };
  }
  return null;
}
