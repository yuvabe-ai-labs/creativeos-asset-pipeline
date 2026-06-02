import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { uniqueSlug } from "@/lib/slug";
import type { ClientRow } from "./types";

// The clients repository: every clients-table query goes through these.
// Server-only (imports the service-role client).

export async function listClients(): Promise<ClientRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClientRow[];
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
  logo?: string | null;
  contextNotes?: string;
}): Promise<ClientRow> {
  const supabase = createServerSupabase();

  // generate a slug unique across existing clients
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
    .insert({
      slug,
      name: input.name,
      logo: input.logo ?? null,
      context_notes: input.contextNotes ?? "",
    })
    .select()
    .single();
  if (error) throw error;
  return data as ClientRow;
}
