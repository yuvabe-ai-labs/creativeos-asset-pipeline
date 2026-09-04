import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { MoodboardItem } from "./moodboards";

export type Signal = {
  id: string;
  client_id: string;
  name: string;
  tags: string[];
  description: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SignalWithItems = Signal & { items: MoodboardItem[] };

export async function listSignalsWithItems(clientId: string): Promise<SignalWithItems[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("signals")
    .select("*, signal_items(position, moodboard_items(*))")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  type Row = Signal & {
    signal_items: { position: number; moodboard_items: MoodboardItem | null }[] | null;
  };
  return ((data ?? []) as Row[]).map((row) => {
    const { signal_items, ...signal } = row;
    const items = (signal_items ?? [])
      .filter(
        (si): si is { position: number; moodboard_items: MoodboardItem } =>
          si.moodboard_items != null,
      )
      .sort((a, b) => a.position - b.position)
      .map((si) => si.moodboard_items);
    return { ...signal, items };
  });
}

export async function createSignal(
  clientId: string,
  input: {
    name: string;
    tags: string[];
    description: string;
    createdBy?: string;
    itemIds: string[];
  },
): Promise<Signal> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("signals")
    .insert({
      client_id: clientId,
      name: input.name,
      tags: input.tags,
      description: input.description,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const signal = data as Signal;

  if (input.itemIds.length) {
    const links = input.itemIds.map((itemId, i) => ({
      signal_id: signal.id,
      item_id: itemId,
      position: i,
    }));
    const { error: linkError } = await supabase.from("signal_items").insert(links);
    if (linkError) throw linkError;
  }
  return signal;
}

export async function updateSignal(
  id: string,
  patch: { name?: string; tags?: string[]; description?: string },
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("signals")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSignal(id: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("signals").delete().eq("id", id);
  if (error) throw error;
}
