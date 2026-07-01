import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { STALE_MS } from "@/lib/canvas/lock-state";

const STALE_SECONDS = Math.round(STALE_MS / 1000);

// Atomic acquire / stale take-over via the RPC (migration 0010). Returns ok, or the current holder.
export async function acquireCanvasLock(
  canvasId: string,
  sessionId: string,
  name: string | null,
): Promise<{ ok: true } | { ok: false; heldBy: { name: string | null } }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("acquire_canvas_lock", {
    p_canvas_id: canvasId,
    p_session_id: sessionId,
    p_name: name,
    p_stale_seconds: STALE_SECONDS,
  });
  if (error) throw error;
  if (data === true) return { ok: true };

  const { data: row, error: readErr } = await supabase
    .from("canvases")
    .select("editing_name")
    .eq("id", canvasId)
    .maybeSingle();
  if (readErr) throw readErr;
  return {
    ok: false,
    heldBy: { name: (row as { editing_name: string | null } | null)?.editing_name ?? null },
  };
}

// Refresh the heartbeat — only if I still hold it. 0 rows updated → I lost the lock.
export async function heartbeatCanvasLock(
  canvasId: string,
  sessionId: string,
): Promise<{ ok: boolean }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .update({ editing_heartbeat_at: new Date().toISOString() })
    .eq("id", canvasId)
    .eq("editing_session_id", sessionId)
    .select("id");
  if (error) throw error;
  return { ok: (data?.length ?? 0) > 0 };
}

// Release the lock if I hold it (best-effort; TTL is the backstop).
export async function releaseCanvasLock(
  canvasId: string,
  sessionId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("canvases")
    .update({ editing_session_id: null, editing_name: null, editing_heartbeat_at: null })
    .eq("id", canvasId)
    .eq("editing_session_id", sessionId);
  if (error) throw error;
}

// Read the lock for a viewer's poll. heldBy is null when unheld (staleness computed client-side).
export async function getCanvasLock(
  canvasId: string,
): Promise<{ heldBy: { name: string | null } | null; heartbeatAt: string | null }> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("editing_session_id, editing_name, editing_heartbeat_at")
    .eq("id", canvasId)
    .maybeSingle();
  if (error) throw error;
  const row = data as {
    editing_session_id: string | null;
    editing_name: string | null;
    editing_heartbeat_at: string | null;
  } | null;
  if (!row || !row.editing_session_id) return { heldBy: null, heartbeatAt: null };
  return { heldBy: { name: row.editing_name }, heartbeatAt: row.editing_heartbeat_at };
}

// The raw holder session id — for the server-side save guard.
export async function getCanvasLockHolder(canvasId: string): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("editing_session_id")
    .eq("id", canvasId)
    .maybeSingle();
  if (error) throw error;
  return (data as { editing_session_id: string | null } | null)?.editing_session_id ?? null;
}
