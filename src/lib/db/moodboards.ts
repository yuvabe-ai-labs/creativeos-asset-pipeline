import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type Moodboard = {
  id: string;
  client_id: string;
  name: string;
  created_at: string;
};

export type MoodboardItem = {
  id: string;
  moodboard_id: string;
  image_url: string;
  source_url: string | null;
  position: number;
  added_at: string;
};

export async function listMoodboards(clientId: string): Promise<Moodboard[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboards")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Moodboard[];
}

export async function createMoodboard(clientId: string, name: string): Promise<Moodboard> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboards")
    .insert({ client_id: clientId, name })
    .select()
    .single();
  if (error) throw error;
  return data as Moodboard;
}

export async function deleteMoodboard(id: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("moodboards").delete().eq("id", id);
  if (error) throw error;
}

export async function listItems(moodboardId: string): Promise<MoodboardItem[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .select("*")
    .eq("moodboard_id", moodboardId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MoodboardItem[];
}

export async function addItem(
  moodboardId: string,
  input: { imageUrl: string; sourceUrl?: string },
): Promise<MoodboardItem> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .insert({ moodboard_id: moodboardId, image_url: input.imageUrl, source_url: input.sourceUrl ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as MoodboardItem;
}

export async function removeItem(itemId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("moodboard_items").delete().eq("id", itemId);
  if (error) throw error;
}
