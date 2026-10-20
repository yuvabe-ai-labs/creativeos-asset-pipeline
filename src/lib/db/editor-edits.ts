// The reel's edit: one row per Editor node (D390, migration 0059).
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { EditDoc } from "@/lib/editor/types";

/** The canvas's edit, unparsed: the caller validates it (a canvas has at most one Editor). */
export async function getEditorEdit(canvasId: string): Promise<{ nodeId: string; doc: unknown } | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("editor_edits")
    .select("node_id, doc")
    .eq("canvas_id", canvasId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = data as { node_id: string; doc: unknown } | null;
  return row ? { nodeId: row.node_id, doc: row.doc } : null;
}

export async function saveEditorEdit(a: { nodeId: string; canvasId: string; doc: EditDoc }): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("editor_edits")
    .upsert(
      { node_id: a.nodeId, canvas_id: a.canvasId, doc: a.doc, updated_at: new Date().toISOString() },
      { onConflict: "node_id" },
    );
  if (error) throw error;
}
