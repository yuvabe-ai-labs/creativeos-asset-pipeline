import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/slug";
import type { CanvasRow } from "./types";
import {
  mapRecentCanvas,
  type RawRecentCanvasRow,
  type RecentCanvas,
} from "./recent-canvas";

// The canvases repository — same shape as clients, scoped to a client.

export async function listCanvases(clientId: string): Promise<CanvasRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CanvasRow[];
}

export async function getCanvasById(id: string): Promise<CanvasRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as CanvasRow) ?? null;
}

export async function getCanvasBySlug(
  clientId: string,
  slug: string,
): Promise<CanvasRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("*")
    .eq("client_id", clientId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as CanvasRow) ?? null;
}

export async function createCanvas(input: {
  clientId: string;
  name: string;
}): Promise<CanvasRow> {
  const supabase = createServerSupabase();
  const { data: existing, error: readErr } = await supabase
    .from("canvases")
    .select("slug")
    .eq("client_id", input.clientId);
  if (readErr) throw readErr;
  const slug = uniqueSlug(
    input.name,
    (existing ?? []).map((r: { slug: string }) => r.slug),
  );

  const { data, error } = await supabase
    .from("canvases")
    .insert({ client_id: input.clientId, slug, name: input.name })
    .select()
    .single();
  if (error) throw error;
  return data as CanvasRow;
}

// Recency-sorted canvases within the caller's org (for the Clients-home "Recent
// canvases" tab). Capped so the list stays bounded as canvas count grows. Org-scoped
// for everyone, including super_admin — see the note on listClients.
export async function listRecentCanvases(
  orgId: string,
  limit = 30,
): Promise<RecentCanvas[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("*, clients!inner(slug, name, logo_url, org_id)")
    .eq("clients.org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as RawRecentCanvasRow[]).map(mapRecentCanvas);
}

// The concurrency token for autosave: the canvas's updated_at (bumped by the
// child-table triggers in migration 0008 on every node/edge/version write).
export async function getCanvasUpdatedAt(
  canvasId: string,
): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("updated_at")
    .eq("id", canvasId)
    .maybeSingle();
  if (error) throw error;
  return (data as { updated_at: string } | null)?.updated_at ?? null;
}

export async function renameCanvas(
  id: string,
  name: string,
): Promise<CanvasRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .update({ name })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Canvas not found");
  return data as CanvasRow;
}

export async function deleteCanvas(id: string): Promise<void> {
  const supabase = createServerSupabase();
  // Guard: refuse to delete if a session is actively editing (fresh heartbeat within 60s)
  const { data: canvas } = await supabase
    .from("canvases")
    .select("editing_session_id, editing_heartbeat_at")
    .eq("id", id)
    .maybeSingle();
  if (canvas?.editing_session_id && canvas.editing_heartbeat_at) {
    const heartbeat = new Date(canvas.editing_heartbeat_at).getTime();
    if (Date.now() - heartbeat < 60_000) {
      throw new Error("Canvas is currently being edited — close all editor tabs first.");
    }
  }
  const { error } = await supabase.from("canvases").delete().eq("id", id);
  if (error) throw error;
}
