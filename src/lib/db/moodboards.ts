import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ReferenceKind } from "@/lib/market/constants";

/** Lifecycle of the media archive for one item (D265).
 *  `skipped` is terminal and not a failure — a link or a TikTok has no media of ours
 *  to own, so there is nothing to retry. */
export const ARCHIVE_STATUSES = [
  "pending",
  "downloading",
  "ready",
  "failed",
  "skipped",
] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];

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
  /** The re-hosted media itself — the video or full-resolution still, not the preview. */
  media_url: string | null;
  media_bytes: number | null;
  media_type: string | null;
  archive_status: ArchiveStatus;
  archive_error: string | null;
  archive_attempts: number;
  archive_started_at: string | null;
  archived_at: string | null;
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

// ── Media archive (D264, D265) ────────────────────────────────────────────────
// Four transitions, each a single UPDATE. They live here rather than in the archive
// module for the same reason every other query does: the archive module owns the
// decision, this file owns the SQL.

export async function getItem(itemId: string): Promise<MoodboardItem | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  return (data as MoodboardItem) ?? null;
}

/**
 * Take ownership of a row before the slow work.
 *
 * `attempts` is passed in rather than incremented here because the caller has just
 * read the row — and because the count must be owned by exactly one transition. If
 * the failure path also incremented, a row would retire after two real attempts
 * instead of four.
 *
 * `archive_started_at` is what lets the sweep find rows a crashed run abandoned
 * mid-download; without it they sit in `downloading` forever, invisible.
 */
export async function claimArchive(itemId: string, attempts: number): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({
      archive_status: "downloading",
      archive_attempts: attempts,
      archive_started_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (error) throw error;
}

export async function completeArchive(
  itemId: string,
  input: { mediaUrl: string; mediaBytes: number; mediaType: string },
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({
      media_url: input.mediaUrl,
      media_bytes: input.mediaBytes,
      media_type: input.mediaType,
      archive_status: "ready",
      // A previous attempt's reason must not linger on a row that has since
      // succeeded, or the UI reports a healthy archive as broken.
      archive_error: null,
      archived_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (error) throw error;
}

/** Records WHY. This is the capability today's pipeline lacks: a null `thumbnail_url`
 *  cannot distinguish "not tried yet" from "tried and impossible", which is why the
 *  62 Instagram items with no preview have stayed that way. */
export async function failArchive(itemId: string, reason: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({ archive_status: "failed", archive_error: reason.slice(0, 500) })
    .eq("id", itemId);
  if (error) throw error;
}

/** Terminal, and not a failure — an article has no media file for us to own. */
export async function skipArchive(itemId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({ archive_status: "skipped" })
    .eq("id", itemId);
  if (error) throw error;
}

/**
 * The sweep's work list: never attempted and failed-but-retryable, in one pass.
 * Oldest first, so a backlog drains fairly instead of starving the rows that have
 * been waiting longest — which on the first run is the entire existing corpus.
 *
 * The client id is fetched with a second query rather than a PostgREST embed.
 * An embedded to-one relation surfaces as either an object or a single-element
 * array depending on schema-cache heuristics, and unwrapping that correctly means
 * a fourth copy of a helper that currently lives in the API layer. Two plain
 * queries for a batch of 50 is the cheaper trade.
 */
export async function listArchivable(
  limit: number,
  maxAttempts: number,
): Promise<Array<{ id: string; clientId: string }>> {
  const supabase = createServerSupabase();
  const { data: items, error } = await supabase
    .from("moodboard_items")
    .select("id, moodboard_id")
    .in("archive_status", ["pending", "failed"])
    .lt("archive_attempts", maxAttempts)
    .order("added_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const rows = (items ?? []) as Array<{ id: string; moodboard_id: string }>;
  if (rows.length === 0) return [];

  const boardIds = [...new Set(rows.map((r) => r.moodboard_id))];
  const { data: boards, error: boardError } = await supabase
    .from("moodboards")
    .select("id, client_id")
    .in("id", boardIds);
  if (boardError) throw boardError;

  const clientByBoard = new Map(
    ((boards ?? []) as Array<{ id: string; client_id: string }>).map((b) => [b.id, b.client_id]),
  );

  return rows.flatMap((r) => {
    const clientId = clientByBoard.get(r.moodboard_id);
    // A board deleted between the two queries leaves an orphan; skip rather than
    // archive into a client folder we cannot name.
    return clientId ? [{ id: r.id, clientId }] : [];
  });
}

/**
 * Move rows a crashed run abandoned in `downloading` back to `failed`, which makes
 * them eligible for the retry branch on the next pass.
 *
 * There is no equivalent of reconcile-stuck-generations to lean on: that reconciler
 * keys off `stuck_reservations`, a credit-ledger view, and an archive reserves no
 * credits. `archive_started_at` is what makes these rows findable at all.
 */
export async function releaseStuckArchives(olderThanIso: string): Promise<number> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .update({ archive_status: "failed", archive_error: "abandoned mid-download" })
    .eq("archive_status", "downloading")
    .lt("archive_started_at", olderThanIso)
    .select("id");
  if (error) throw error;
  return ((data ?? []) as unknown[]).length;
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
