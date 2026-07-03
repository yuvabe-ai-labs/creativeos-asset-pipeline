import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/slug";
import type { ClientRow } from "./types";
import {
  mapClientWithCount,
  type ClientWithCount,
  type RawClientWithCanvases,
} from "./client-with-count";

// The clients repository: every clients-table query goes through these.
// Server-only (imports the service-role client).

export type { ClientWithCount };

export async function listClients(): Promise<ClientWithCount[]> {
  const supabase = createServerSupabase();
  // Embed canvas timestamps over the FK relationship; derive count + last_active in JS.
  const { data, error } = await supabase
    .from("clients")
    .select("*, canvases(updated_at)")
    .is("archived_at", null) // active clients only
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawClientWithCanvases[]).map(mapClientWithCount);
}

// Archived clients, most-recently-archived first — for the Archived tab.
export async function listArchivedClients(): Promise<ClientWithCount[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("*, canvases(updated_at)")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawClientWithCanvases[]).map(mapClientWithCount);
}

// Soft delete: archive (stamp archived_at = now) or unarchive (clear to null).
export async function setClientArchived(
  clientId: string,
  archived: boolean,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", clientId);
  if (error) throw error;
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

export async function updateClientWebsiteUrl(
  clientId: string,
  websiteUrl: string | null,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ website_url: websiteUrl })
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
