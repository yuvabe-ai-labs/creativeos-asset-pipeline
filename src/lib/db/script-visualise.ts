import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/avatars/utils";
import { reelLabel } from "@/lib/scripts/utils";

// Spec 3's reads and writes on client_scripts. Kept apart from src/lib/db/scripts.ts so specs 2
// and 4, built at the same time, do not edit the same file (plan: merge points). Every query
// filters on client_id as well as the id, as src/lib/db/scripts.ts does.

type StoredHeader = { header?: { reelNumber?: number | null; title?: string } };

/** D346 — the live scripts whose cast uses this avatar, as "Reel 01 · Golu starts today". */
export async function listScriptsUsingAvatar(clientId: string, avatarId: string): Promise<string[]> {
  if (!isUuid(avatarId)) return [];
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts")
    .select("doc")
    .eq("client_id", clientId)
    .is("archived_at", null)
    // jsonb containment: some cast member has this avatarId.
    .contains("doc", { cast: [{ avatarId }] });
  if (error) throw error;
  return ((data ?? []) as { doc: StoredHeader }[]).map(({ doc }) =>
    [reelLabel(doc.header?.reelNumber ?? null), doc.header?.title].filter(Boolean).join(" · ") || "an untitled script",
  );
}
