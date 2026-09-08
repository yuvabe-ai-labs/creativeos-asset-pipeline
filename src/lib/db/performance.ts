// DB access for the Performance tab (D235). Thin wrappers over the service-role
// client, like the other src/lib/db modules — derivation lives in
// src/lib/market/performance.ts, not here.
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  parseInstagramHandle,
  type NormalizedPost,
  type NormalizedSnapshot,
} from "@/lib/market/performance";
import type { BrandDetails } from "@/lib/brand-kit/types";

export type AccountSnapshotRow = {
  id: string;
  client_id: string;
  platform: string;
  handle: string;
  followers_count: number;
  follows_count: number;
  posts_count: number;
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

const SNAPSHOT_COLS =
  "id, client_id, platform, handle, followers_count, follows_count, posts_count, captured_at";

export async function insertAccountSnapshot(
  clientId: string,
  snap: NormalizedSnapshot,
): Promise<AccountSnapshotRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("account_snapshots")
    .insert({
      client_id: clientId,
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

export async function getLatestSnapshot(clientId: string): Promise<AccountSnapshotRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("account_snapshots")
    .select(SNAPSHOT_COLS)
    .eq("client_id", clientId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AccountSnapshotRow | null) ?? null;
}

export async function listFollowerSeries(
  clientId: string,
): Promise<{ captured_at: string; followers_count: number }[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("account_snapshots")
    .select("captured_at, followers_count")
    .eq("client_id", clientId)
    .order("captured_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { captured_at: string; followers_count: number }[];
}

export async function listTrackedPosts(clientId: string): Promise<TrackedPostRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("tracked_posts")
    .select("*")
    .eq("client_id", clientId)
    .order("posted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TrackedPostRow[];
}

/** Every client the daily sweep should scrape: has a parseable brand_details.instagram. */
export async function listClientsWithInstagramHandle(): Promise<{ id: string; handle: string }[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("clients").select("id, brand_details");
  if (error) throw error;
  const rows = (data ?? []) as { id: string; brand_details: BrandDetails | null }[];
  return rows.flatMap((row) => {
    const handle = parseInstagramHandle(row.brand_details?.instagram);
    return handle ? [{ id: row.id, handle }] : [];
  });
}
