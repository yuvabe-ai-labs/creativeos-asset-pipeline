import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { rowToScript, type ScriptRow } from "@/lib/scripts/rows";
import type { Script } from "@/lib/scripts/schema";
import { SCRIPT_DELETE_BLOCKS, type ScriptDeleteBlock, type ScriptStage } from "@/lib/scripts/constants";
import { isUuid } from "@/lib/avatars/utils";

// Every query filters on client_id as well as the script id. withClient authorises the CLIENT in
// the URL, not the script id beside it (the same reasoning as src/lib/db/avatars.ts).

const byReel = (a: Script, b: Script) =>
  (a.doc.header.reelNumber ?? Number.MAX_SAFE_INTEGER) - (b.doc.header.reelNumber ?? Number.MAX_SAFE_INTEGER) ||
  b.updatedAt.localeCompare(a.updatedAt);

export async function listScripts(clientId: string, opts: { stage?: ScriptStage } = {}): Promise<Script[]> {
  const supabase = createServerSupabase();
  let query = supabase.from("client_scripts").select("*").eq("client_id", clientId).is("archived_at", null);
  if (opts.stage) query = query.eq("stage", opts.stage);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ScriptRow[])
    .map(rowToScript)
    .filter((s): s is Script => s !== null)
    .sort(byReel);
}

export async function getScript(clientId: string, scriptId: string): Promise<Script | null> {
  // Postgres throws on a non-UUID id; a malformed id is simply not found.
  if (!isUuid(scriptId)) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts")
    .select("*")
    .eq("id", scriptId)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToScript(data as ScriptRow) : null;
}

export type ScriptDeleteResult = "deleted" | "not_found" | ScriptDeleteBlock;
const DELETE_RESULTS: readonly string[] = ["deleted", "not_found", ...SCRIPT_DELETE_BLOCKS];

/** D384 — erase a script for good, in one transaction that locks it, refuses when a canvas, the
 *  client's link or a running panel draw depends on it, and otherwise deletes (its chat, storyboard
 *  and review rows cascade). Storage files are kept: canvases point at them. */
export async function deleteScript(clientId: string, scriptId: string): Promise<ScriptDeleteResult> {
  if (!isUuid(scriptId)) return "not_found";
  const { data, error } = await createServerSupabase().rpc("delete_client_script", {
    p_client_id: clientId,
    p_script_id: scriptId,
  });
  if (error) throw error;
  if (typeof data === "string" && DELETE_RESULTS.includes(data)) return data as ScriptDeleteResult;
  throw new Error(`Unexpected delete result: ${JSON.stringify(data)}`);
}

/** D384 — the library's standing blocks, read once for the whole page: a canvas before a share.
 *  A running draw is short-lived, so only the delete itself reports it. A failed read gives no
 *  blocks (the page still renders, and the server still refuses). */
export async function listScriptDeleteBlocks(clientId: string): Promise<Record<string, Exclude<ScriptDeleteBlock, "drawing">>> {
  try {
    const supabase = createServerSupabase();
    const [canvases, reviews] = await Promise.all([
      supabase.from("canvases").select("source_script_id").eq("client_id", clientId).not("source_script_id", "is", null),
      supabase.from("script_reviews").select("script_id").eq("client_id", clientId),
    ]);
    if (canvases.error) throw canvases.error;
    if (reviews.error) throw reviews.error;
    const blocks: Record<string, Exclude<ScriptDeleteBlock, "drawing">> = {};
    for (const r of (reviews.data ?? []) as { script_id: string }[]) blocks[r.script_id] = "shared";
    for (const c of (canvases.data ?? []) as { source_script_id: string }[]) blocks[c.source_script_id] = "has_canvas";
    return blocks;
  } catch (e) {
    console.error("[scripts] could not read the library's delete blocks", e);
    return {};
  }
}
