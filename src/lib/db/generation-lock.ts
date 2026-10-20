// Whether a node may generate while it feeds the Editor (D389), in one round trip (migration 0059).
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GenerationLock } from "@/lib/editor/types";

/** Throws on a database error: a failed check must never read as "unlocked" (rule 13). */
export async function getEditorGenerationLock(nodeId: string): Promise<GenerationLock | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("editor_generation_lock", { p_node_id: nodeId });
  if (error) throw error;
  return data === "editor" || data === "dub" ? data : null;
}
