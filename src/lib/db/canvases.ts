import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/slug";
import type { CanvasRow } from "./types";

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
