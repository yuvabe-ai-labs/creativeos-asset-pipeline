import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { rowToScript, type ScriptRow } from "@/lib/scripts/rows";
import type { Script } from "@/lib/scripts/schema";
import type { ScriptStage } from "@/lib/scripts/constants";
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
