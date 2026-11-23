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

/** True when every id is an item on one of this client's boards. The ids come from the request
 *  body, and the signal list embeds a signal's items, so another client's item must never be
 *  linked into this client's signal. */
async function itemsBelongToClient(clientId: string, itemIds: string[]): Promise<boolean> {
  const unique = [...new Set(itemIds)];
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .select("id, moodboards!inner(client_id)")
    .in("id", unique)
    .eq("moodboards.client_id", clientId);
  if (error) throw error;
  return (data ?? []).length === unique.length;
}

/** Null when an item is not on this client's boards: nothing is written. */
export async function createSignal(
  clientId: string,
  input: {
    name: string;
    tags: string[];
    description: string;
    createdBy?: string;
    itemIds: string[];
  },
): Promise<Signal | null> {
  if (input.itemIds.length && !(await itemsBelongToClient(clientId, input.itemIds))) return null;
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

// Both are scoped to the client the route checked: the signal id comes from the URL beside it.
// False when no signal of this client has that id (another client's, or gone).
export async function updateSignal(
  clientId: string,
  id: string,
  patch: { name?: string; tags?: string[]; description?: string },
): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("signals")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("client_id", clientId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function deleteSignal(clientId: string, id: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("signals")
    .delete()
    .eq("id", id)
    .eq("client_id", clientId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
