// DB access for the Performance tab (D235, D252, D253). Thin wrappers over the
// service-role client, like the other src/lib/db modules — derivation lives in
// src/lib/market/performance.ts, not here.
//
// Every read is scoped to ONE handle, because a client can track several (D253) and
// each sub-tab stands alone. `tracked_handles` is the enrolment list and the only
// source of truth for what the pipeline scrapes (D252).
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { NormalizedPost, NormalizedSnapshot } from "@/lib/market/performance";

// V1 is Instagram-only, enforced by a check constraint on all three tables. Naming it
// once here means the TikTok expansion is a parameter, not a search-and-replace.
const PLATFORM = "instagram";

export type TrackedHandleRow = {
  id: string;
  client_id: string;
  platform: string;
  handle: string;
  added_at: string;
};

export type AccountSnapshotRow = {
  id: string;
  client_id: string;
  platform: string;
  handle: string;
  followers_count: number;
  follows_count: number;
  posts_count: number;
  raw: unknown;
  captured_at: string;
};

export type TrackedPostRow = {
  id: string;
  client_id: string;
  platform: string;
  handle: string;
  short_code: string;
  post_type: "image" | "video" | "carousel";
  caption: string;
  post_url: string;
  likes_count: number | null;
  comments_count: number;
  video_view_count: number | null;
  posted_at: string;
  thumbnail_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

// `raw` is included: the identity strip reads category/externalUrl/avatar back out of
// the latest snapshot's payload. It is deliberately NOT selected by listFollowerSeries,
// which would otherwise drag every stored payload over the wire to draw one line.
const SNAPSHOT_COLS =
  "id, client_id, platform, handle, followers_count, follows_count, posts_count, raw, captured_at";

const HANDLE_COLS = "id, client_id, platform, handle, added_at";

/* ── Enrolment (D252) ─────────────────────────────────────────────────────── */

export async function listTrackedHandles(clientId: string): Promise<TrackedHandleRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("tracked_handles")
    .select(HANDLE_COLS)
    .eq("client_id", clientId)
    .eq("platform", PLATFORM)
    .order("added_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TrackedHandleRow[];
}

/** Upsert, not insert: adding a handle twice is a no-op, not a 500. The unique key
 *  (client_id, platform, handle) makes a double-submitted dialog harmless. */
export async function addTrackedHandle(
  clientId: string,
  handle: string,
): Promise<TrackedHandleRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("tracked_handles")
    .upsert(
      { client_id: clientId, platform: PLATFORM, handle },
      { onConflict: "client_id,platform,handle" },
    )
    .select(HANDLE_COLS)
    .single();
  if (error) throw error;
  return data as TrackedHandleRow;
}

/** Unenrols only. Snapshot history is deliberately left behind (D253) — it cannot be
 *  re-scraped, so an accidental removal must not destroy it. */
export async function removeTrackedHandle(clientId: string, handle: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("tracked_handles")
    .delete()
    .eq("client_id", clientId)
    .eq("platform", PLATFORM)
    .eq("handle", handle);
  if (error) throw error;
}

export async function isHandleTracked(clientId: string, handle: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("tracked_handles")
    .select("id")
    .eq("client_id", clientId)
    .eq("platform", PLATFORM)
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** The daily sweep's entire work list (D252) — every enrolled handle, all clients. */
export async function listAllTrackedHandles(): Promise<{ clientId: string; handle: string }[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("tracked_handles")
    .select("client_id, handle")
    .eq("platform", PLATFORM)
    .order("added_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as { client_id: string; handle: string }[];
  return rows.map((row) => ({ clientId: row.client_id, handle: row.handle }));
}

/* ── Writes (unchanged by D252/D253) ──────────────────────────────────────── */

export async function insertAccountSnapshot(
  clientId: string,
  snap: NormalizedSnapshot,
): Promise<AccountSnapshotRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("account_snapshots")
    .insert({
      client_id: clientId,
      platform: PLATFORM,
      handle: snap.handle,
      followers_count: snap.followersCount,
      follows_count: snap.followsCount,
      posts_count: snap.postsCount,
      raw: snap.raw,
    })
    .select(SNAPSHOT_COLS)
    .single();
  if (error) throw error;
  return data as AccountSnapshotRow;
}

export async function upsertTrackedPost(
  clientId: string,
  handle: string,
  post: NormalizedPost,
): Promise<TrackedPostRow> {
  const supabase = createServerSupabase();
  // thumbnail_url and first_seen_at are deliberately ABSENT from the payload: on
  // conflict, Supabase updates only the provided columns, so both survive re-scrapes.
  const { data, error } = await supabase
    .from("tracked_posts")
    .upsert(
      {
        client_id: clientId,
        platform: PLATFORM,
        handle,
        short_code: post.shortCode,
        post_type: post.postType,
        caption: post.caption,
        post_url: post.postUrl,
        likes_count: post.likesCount,
        comments_count: post.commentsCount,
        video_view_count: post.videoViewCount,
        posted_at: post.postedAt,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "client_id,platform,short_code" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as TrackedPostRow;
}

export async function updateTrackedPostThumbnail(id: string, url: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("tracked_posts")
    .update({ thumbnail_url: url })
    .eq("id", id);
  if (error) throw error;
}

/* ── Handle-scoped reads (D253) ───────────────────────────────────────────── */

export async function getLatestSnapshot(
  clientId: string,
  handle: string,
): Promise<AccountSnapshotRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("account_snapshots")
    .select(SNAPSHOT_COLS)
    .eq("client_id", clientId)
    .eq("platform", PLATFORM)
    .eq("handle", handle)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AccountSnapshotRow | null) ?? null;
}

export async function listFollowerSeries(
  clientId: string,
  handle: string,
): Promise<{ captured_at: string; followers_count: number }[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("account_snapshots")
    .select("captured_at, followers_count")
    .eq("client_id", clientId)
    .eq("platform", PLATFORM)
    .eq("handle", handle)
    .order("captured_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { captured_at: string; followers_count: number }[];
}

export async function listTrackedPosts(
  clientId: string,
  handle: string,
): Promise<TrackedPostRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("tracked_posts")
    .select("*")
    .eq("client_id", clientId)
    .eq("platform", PLATFORM)
    .eq("handle", handle)
    .order("posted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TrackedPostRow[];
}
