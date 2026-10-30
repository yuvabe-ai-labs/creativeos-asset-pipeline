import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/avatars/utils";
import { rowToScript, type ScriptRow } from "@/lib/scripts/rows";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { isScriptStage, type ScriptStage } from "@/lib/scripts/constants";
import { isVisualiseStage } from "@/lib/scripts/visualise/cast";
import { applyAssetOp, type AssetOp } from "@/lib/scripts/assets";
import { changeGenerateScript } from "@/lib/db/script-generate";
import { scriptAssetsPrefix } from "@/lib/storage/paths";
import { publicUrlFor } from "@/lib/storage/gcs";

// D446 — the one write for a script's products, locations and per-shot picks, at whichever stage
// they may change. At Generate it goes through changeGenerateScript, so it bumps the doc version the
// copilot's proposals compare against (D337); at Visualise and In review it is the same optimistic
// write on `updated_at` that a cast avatar link uses (D338). Nowhere else.

export type AssetChangeResult =
  | { ok: true; doc: ScriptDoc; stage: ScriptStage }
  | { ok: false; error: string; status: number };

/** Builds the op from the doc as it is NOW, so "add this image" appends to the current list. */
export type AssetOpBuilder = (doc: ScriptDoc) => AssetOp | { error: string; status: number };

const STAGE_REFUSAL = "Products and locations can be changed while the script is being written or visualised.";

export async function changeScriptAssets(
  clientId: string,
  scriptId: string,
  build: AssetOpBuilder,
): Promise<AssetChangeResult> {
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
    if (!isScriptStage(stored.stage)) return { ok: false, error: "Script not found.", status: 404 };

    if (stored.stage === "generate") {
      const outcome = await changeGenerateScript(clientId, scriptId, (current) => {
        if (!current.doc) return { error: "There's no draft yet.", status: 409 };
        const op = build(current.doc);
        if ("error" in op) return op;
        const r = applyAssetOp(current.doc, op);
        if (!r.ok) return { error: r.error, status: 422 };
        return { patch: { doc: r.doc }, result: r.doc };
      });
      if ("error" in outcome) return { ok: false, error: outcome.error, status: outcome.status };
      return { ok: true, doc: outcome.result, stage: "generate" };
    }

    if (!isVisualiseStage(stored.stage)) return { ok: false, error: STAGE_REFUSAL, status: 409 };
    const script = rowToScript(stored);
    if (!script) return { ok: false, error: "The script could not be read.", status: 500 };
    const op = build(script.doc);
    if ("error" in op) return { ok: false, ...op };
    const r = applyAssetOp(script.doc, op);
    if (!r.ok) return { ok: false, error: r.error, status: 422 };
    const { data, error } = await supabase
      .from("client_scripts")
      .update({ doc: r.doc, updated_at: new Date().toISOString() })
      .eq("id", scriptId).eq("client_id", clientId).eq("updated_at", stored.updated_at)
      .select("stage").maybeSingle();
    if (error) throw error;
    if (data) return { ok: true, doc: r.doc, stage: stored.stage };
  }
  return { ok: false, error: "The script changed at the same time. Try again.", status: 409 };
}

/** D446, rule 14 — every image URL a request adds must be one this client may use: the script's own
 *  uploads and plates, or one of the client's brand-kit or KB images. Returns the URLs it refuses. */
export async function foreignImageUrls(clientId: string, scriptId: string, urls: string[]): Promise<string[]> {
  const own = publicUrlFor(scriptAssetsPrefix(clientId, scriptId));
  const rest = [...new Set(urls)].filter((u) => !u.startsWith(own));
  if (rest.length === 0) return [];
  const supabase = createServerSupabase();
  const [kit, kb] = await Promise.all([
    supabase.from("client_brand_assets").select("storage_url").eq("client_id", clientId).in("storage_url", rest),
    supabase.from("client_brand_images").select("storage_url").eq("client_id", clientId).in("storage_url", rest),
  ]);
  if (kit.error) throw kit.error;
  if (kb.error) throw kb.error;
  const known = new Set([...(kit.data ?? []), ...(kb.data ?? [])].map((r) => (r as { storage_url: string }).storage_url));
  return rest.filter((u) => !known.has(u));
}
