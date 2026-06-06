import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/slug";
import type { ClientRow } from "./types";

// The clients repository: every clients-table query goes through these.
// Server-only (imports the service-role client).

export type ClientWithCount = ClientRow & { canvas_count: number };

export async function listClients(): Promise<ClientWithCount[]> {
  const supabase = createServerSupabase();
  // `canvases(count)` is a Supabase embedded aggregate over the FK relationship.
  const { data, error } = await supabase
    .from("clients")
    .select("*, canvases(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as (ClientRow & {
    canvases: { count: number }[] | null;
  })[];
  return rows.map((r) => ({ ...r, canvas_count: r.canvases?.[0]?.count ?? 0 }));
}

export async function getClientById(id: string): Promise<ClientRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as ClientRow) ?? null;
}

export async function getClientBySlug(slug: string): Promise<ClientRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as ClientRow) ?? null;
}

export async function createClient(input: {
  name: string;
}): Promise<ClientRow> {
  const supabase = createServerSupabase();

  const { data: existing, error: readErr } = await supabase
    .from("clients")
    .select("slug");
  if (readErr) throw readErr;
  const slug = uniqueSlug(
    input.name,
    (existing ?? []).map((r: { slug: string }) => r.slug),
  );

  const { data, error } = await supabase
    .from("clients")
    .insert({ slug, name: input.name })
    .select()
    .single();
  if (error) throw error;
  return data as ClientRow;
}

export async function updateClientLogoUrl(
  clientId: string,
  logoUrl: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ logo_url: logoUrl })
    .eq("id", clientId);
  if (error) throw error;
}

export async function setKBStatus(
  clientId: string,
  status: ClientRow["kb_status"],
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ kb_status: status })
    .eq("id", clientId);
  if (error) throw error;
}
