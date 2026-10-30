import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/avatars/utils";
import { rowToPanelTake, type PanelTakeRow } from "@/lib/scripts/visualise/rows";
import type { PanelFaces, PanelTake } from "@/lib/scripts/visualise/schema";

// D338, D344 — storyboard panel takes and picks, keyed by script and shot. Callers have already
// loaded the script under its client (getScript filters on client_id), so these key on the
// script id. Spec 4 reads listPanelPicks + listPanelTakes to freeze what the client sees.

export async function listPanelTakes(scriptId: string): Promise<PanelTake[]> {
  if (!isUuid(scriptId)) return [];
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("script_panel_takes").select("*").eq("script_id", scriptId).order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as PanelTakeRow[]).map(rowToPanelTake);
}

export async function listPanelPicks(scriptId: string): Promise<Record<string, string>> {
  if (!isUuid(scriptId)) return {};
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("script_panel_picks").select("shot_id, take_id").eq("script_id", scriptId);
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { shot_id: string; take_id: string }[]).map((r) => [r.shot_id, r.take_id]));
}

export async function getPanelTake(scriptId: string, takeId: string): Promise<PanelTake | null> {
  if (!isUuid(scriptId) || !isUuid(takeId)) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("script_panel_takes").select("*").eq("id", takeId).eq("script_id", scriptId).maybeSingle();
  if (error) throw error;
  return data ? rowToPanelTake(data as PanelTakeRow) : null;
}

/** D454 — a drawn panel and the generation that drew it: what its storyboard Composite's v1 records. */
export type PanelRecipe = {
  takeId: string;
  url: string;
  prompt: string;
  width: number | null;
  height: number | null;
  generationId: string | null;
  modelUsed: string | null;
  params: Record<string, unknown>;
  inputs: Record<string, unknown>;
};

/** The finished takes among `takeIds` that belong to `scriptId`, each with its generation. One query. */
export async function listPanelRecipes(scriptId: string, takeIds: string[]): Promise<PanelRecipe[]> {
  const ids = takeIds.filter(isUuid);
  if (!isUuid(scriptId) || ids.length === 0) return [];
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("script_panel_takes")
    .select("id, url, prompt, width, height, status, generation_id, generations(model_used, params_snapshot, inputs_snapshot)")
    .eq("script_id", scriptId)
    .in("id", ids);
  if (error) throw error;
  type Gen = { model_used: string | null; params_snapshot: Record<string, unknown> | null; inputs_snapshot: Record<string, unknown> | null };
  type Row = { id: string; url: string | null; prompt: string; width: number | null; height: number | null; status: string; generation_id: string | null; generations: Gen | Gen[] | null };
  return ((data ?? []) as unknown as Row[]).flatMap((r) => {
    if (r.status !== "succeeded" || !r.url) return [];
    const gen = Array.isArray(r.generations) ? r.generations[0] ?? null : r.generations;
    return [{
      takeId: r.id, url: r.url, prompt: r.prompt, width: r.width, height: r.height, generationId: r.generation_id,
      modelUsed: gen?.model_used ?? null, params: gen?.params_snapshot ?? {}, inputs: gen?.inputs_snapshot ?? {},
    }];
  });
}

/** D456 — a generated location plate and the generation that drew it, found by the picture it made
 *  (a location keeps only its picture's URL). */
export type PlateRecipe = {
  url: string;
  generationId: string;
  modelUsed: string | null;
  params: Record<string, unknown>;
  inputs: Record<string, unknown>;
};

/** The script's finished generations that made any of `urls`. One query. */
export async function listPlateRecipes(scriptId: string, urls: string[]): Promise<PlateRecipe[]> {
  if (!isUuid(scriptId) || urls.length === 0) return [];
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("generations")
    .select("id, output_snapshot, model_used, params_snapshot, inputs_snapshot")
    .eq("script_id", scriptId)
    .eq("status", "succeeded")
    .in("output_snapshot", urls);
  if (error) throw error;
  type Row = { id: string; output_snapshot: string; model_used: string | null; params_snapshot: Record<string, unknown> | null; inputs_snapshot: Record<string, unknown> | null };
  return ((data ?? []) as Row[]).map((r) => ({
    url: r.output_snapshot, generationId: r.id, modelUsed: r.model_used, params: r.params_snapshot ?? {}, inputs: r.inputs_snapshot ?? {},
  }));
}

/** A take starts "running" before the model is called, holding what it is drawn from. */
export async function insertPanelTake(input: {
  clientId: string;
  scriptId: string;
  shotId: string;
  prompt: string;
  promptEdited: boolean;
  shotKey: string;
  faces: PanelFaces;
  userId: string;
}): Promise<PanelTake> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("script_panel_takes")
    .insert({
      client_id: input.clientId, script_id: input.scriptId, shot_id: input.shotId,
      prompt: input.prompt, prompt_edited: input.promptEdited, shot_key: input.shotKey,
      faces: input.faces, created_by: input.userId, status: "running",
    })
    .select("*").single();
  if (error) throw error;
  return rowToPanelTake(data as PanelTakeRow);
}

export async function succeedPanelTake(
  takeId: string,
  result: { url: string; width: number | null; height: number | null; generationId: string },
): Promise<PanelTake> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("script_panel_takes")
    .update({
      status: "succeeded", url: result.url, width: result.width, height: result.height,
      generation_id: result.generationId, error: null, updated_at: new Date().toISOString(),
    })
    .eq("id", takeId).select("*").single();
  if (error) throw error;
  return rowToPanelTake(data as PanelTakeRow);
}

export async function failPanelTake(takeId: string, message: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("script_panel_takes")
    .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
    .eq("id", takeId);
  if (error) throw error;
}

export async function setPanelPick(scriptId: string, shotId: string, takeId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("script_panel_picks")
    .upsert({ script_id: scriptId, shot_id: shotId, take_id: takeId, picked_at: new Date().toISOString() },
      { onConflict: "script_id,shot_id" });
  if (error) throw error;
}
