import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/avatars/utils";
import { rowToPanelTake, type PanelTakeRow } from "@/lib/scripts/visualise/rows";
import type { PanelFaces, PanelTake } from "@/lib/scripts/visualise/schema";

// D337, D343 — storyboard panel takes and picks, keyed by script and shot. Callers have already
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
