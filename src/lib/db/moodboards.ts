import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ReferenceKind } from "@/lib/market/constants";

export type Moodboard = {
  id: string;
  client_id: string;
  name: string;
  board_type: "custom" | "direct" | "adjacent";
  created_at: string;
};

export type MoodboardItem = {
  id: string;
  moodboard_id: string;
  image_url: string;
  source_url: string | null;
  kind: ReferenceKind;
  note: string | null;
  added_by: string | null;
  thumbnail_url: string | null;
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
  input: {
    imageUrl: string;
    sourceUrl?: string;
    kind?: ReferenceKind;
    note?: string;
    addedBy?: string;
    thumbnailUrl?: string;
  },
): Promise<MoodboardItem> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .insert({
      moodboard_id: moodboardId,
      image_url: input.imageUrl,
      source_url: input.sourceUrl ?? null,
      kind: input.kind ?? "image",
      note: input.note ?? null,
      added_by: input.addedBy ?? null,
      thumbnail_url: input.thumbnailUrl ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MoodboardItem;
}

export async function updateItemThumbnail(itemId: string, thumbnailUrl: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({ thumbnail_url: thumbnailUrl })
    .eq("id", itemId);
  if (error) throw error;
}

export async function getMoodboardClientId(moodboardId: string): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboards")
    .select("client_id")
    .eq("id", moodboardId)
    .maybeSingle();
  if (error) throw error;
  return (data as { client_id: string } | null)?.client_id ?? null;
}

// Lazily provision the two system boards (D186). Insert-then-reselect on conflict:
// the partial unique index makes the concurrent-create race safe.
export async function ensureSystemBoards(
  clientId: string,
): Promise<{ direct: Moodboard; adjacent: Moodboard }> {
  const supabase = createServerSupabase();

  async function ensure(boardType: "direct" | "adjacent", name: string): Promise<Moodboard> {
    const { data: existing } = await supabase
      .from("moodboards")
      .select("*")
      .eq("client_id", clientId)
      .eq("board_type", boardType)
      .maybeSingle();
    if (existing) return existing as Moodboard;

    const { data, error } = await supabase
      .from("moodboards")
      .insert({ client_id: clientId, name, board_type: boardType })
      .select()
      .single();
    if (!error) return data as Moodboard;

    // 23505 = unique violation: another request created it between our select and insert.
    if ((error as { code?: string }).code === "23505") {
      const { data: raced, error: reErr } = await supabase
        .from("moodboards")
        .select("*")
        .eq("client_id", clientId)
        .eq("board_type", boardType)
        .single();
      if (reErr) throw reErr;
      return raced as Moodboard;
    }
    throw error;
  }

  const [direct, adjacent] = await Promise.all([
    ensure("direct", "Direct"),
    ensure("adjacent", "Adjacent"),
  ]);
  return { direct, adjacent };
}

export async function removeItem(itemId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("moodboard_items").delete().eq("id", itemId);
  if (error) throw error;
}

export type ClientWithBoards = {
  slug: string;
  name: string;
  boards: { id: string; name: string }[];
};

// For the capture extension's picker: active clients + their boards, one round-trip.
// Scoped to ONE org — this previously returned every active client on the platform to
// an unauthenticated caller, which was a cross-org leak once orgs existed. orgId is a
// required argument, not an optional filter, so a caller cannot forget to pass it.
export async function listClientsWithMoodboards(orgId: string): Promise<ClientWithBoards[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("slug, name, moodboards(id, name)")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as { slug: string; name: string; moodboards: { id: string; name: string }[] | null }[]
  ).map((c) => ({ slug: c.slug, name: c.name, boards: c.moodboards ?? [] }));
}
