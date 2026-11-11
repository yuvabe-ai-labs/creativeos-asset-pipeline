// src/lib/db/presets.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

// role_presets.key is unique (migration 0062), so this is an index lookup.
export async function getPresetName(key: string): Promise<string | null> {
  const { data, error } = await createServerSupabase()
    .from("role_presets")
    .select("name")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return (data as { name: string } | null)?.name ?? null;
}
