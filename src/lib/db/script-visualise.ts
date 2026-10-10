import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/avatars/utils";
import { reelLabel } from "@/lib/scripts/utils";
import { rowToScript, type ScriptRow } from "@/lib/scripts/rows";
import type { Script } from "@/lib/scripts/schema";
import { isScriptStage } from "@/lib/scripts/constants";
import { isVisualiseStage, withCastAvatar } from "@/lib/scripts/visualise/cast";

// Spec 3's reads and writes on client_scripts. Kept apart from src/lib/db/scripts.ts so specs 2
// and 4, built at the same time, do not edit the same file (plan: merge points). Every query
// filters on client_id as well as the id, as src/lib/db/scripts.ts does.

type StoredHeader = { header?: { reelNumber?: number | null; title?: string } };

/** D347 — the live scripts whose cast uses this avatar, as "Reel 01 · Golu starts today". */
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

type Failure = { ok: false; error: string; status: number };

/** D338 — set or clear one cast member's avatar. Optimistic on `updated_at`: if the script was
 *  written between the read and the write, the write matches nothing and is tried once more on
 *  the fresh row, so a concurrent change is never overwritten. */
export async function setCastAvatar(
  clientId: string,
  scriptId: string,
  castId: string,
  avatarId: string | null,
): Promise<{ ok: true; script: Script } | Failure> {
  if (!isUuid(scriptId)) return { ok: false, error: "Script not found.", status: 404 };
  const supabase = createServerSupabase();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: row, error: readError } = await supabase
      .from("client_scripts").select("*")
      .eq("id", scriptId).eq("client_id", clientId).is("archived_at", null)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return { ok: false, error: "Script not found.", status: 404 };
    const stored = row as ScriptRow;
    if (!isScriptStage(stored.stage) || !isVisualiseStage(stored.stage)) {
      return { ok: false, error: "Avatars can be changed only while the script is in Visualise or In review.", status: 409 };
    }
    const next = withCastAvatar(stored.doc, castId, avatarId);
    if (!next.ok) return next;
    const { data, error } = await supabase
      .from("client_scripts")
      .update({ doc: next.doc, updated_at: new Date().toISOString() })
      .eq("id", scriptId).eq("client_id", clientId).eq("updated_at", stored.updated_at)
      .select("*").maybeSingle();
    if (error) throw error;
    if (data) {
      const script = rowToScript(data as ScriptRow);
      return script ? { ok: true, script } : { ok: false, error: "The script could not be read back.", status: 500 };
    }
  }
  return { ok: false, error: "The script changed at the same time. Try again.", status: 409 };
}

/** D347 — Reopen: Visualise → Generate, the only stage move spec 3 makes. Conditioned on the
 *  stage, so a script someone already moved is not moved twice. Null when it was not at Visualise. */
export async function reopenScript(clientId: string, scriptId: string): Promise<Script | null> {
  if (!isUuid(scriptId)) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts")
    .update({ stage: "generate", updated_at: new Date().toISOString() })
    .eq("id", scriptId).eq("client_id", clientId).eq("stage", "visualise").is("archived_at", null)
    .select("*").maybeSingle();
  if (error) throw error;
  return data ? rowToScript(data as ScriptRow) : null;
}
