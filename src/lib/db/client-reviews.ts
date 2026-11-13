import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  toCanvasClientFeedback,
  type CanvasClientFeedback,
  type CanvasFeedbackRow,
  type CanvasReviewRow,
  type ReviewCommentRow,
  type ReviewVersionRow,
} from "@/lib/client-review/wire";

export type ReviewByToken = CanvasReviewRow & { title: string };

export class ReviewExistsError extends Error {
  constructor() {
    super("This node already has a review.");
  }
}

// D311: share codes are short, so two nodes can want the same one. The finalize route
// catches this and retries one character longer.
export class ShareCodeTakenError extends Error {
  constructor() {
    super("That share code is taken.");
  }
}

const REVIEW_COLUMNS = "id, canvas_id, node_id, org_id, share_token, created_by, created_at";
const VERSION_COLUMNS =
  "id, review_id, version_no, video_path, title, allow_download, legacy_link, created_by, created_at";


// The cut's title is the node's own title (spec §5) — read from nodes.data.
export type ReviewVersionByLink = { review: ReviewByToken; version: ReviewVersionRow };

/** D496 — what a version link opens: the review (with its title) and that one version, in a
 *  single query. Null when the code or the version doesn't exist. */
export async function getReviewVersionByLink(
  token: string,
  versionNo: number,
): Promise<ReviewVersionByLink | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_versions")
    .select(`${VERSION_COLUMNS}, canvas_reviews!inner(${REVIEW_COLUMNS}, nodes!inner(data))`)
    .eq("canvas_reviews.share_token", token)
    .eq("version_no", versionNo)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  type TitleEmbed = { data: { title?: unknown } | null };
  type ReviewEmbed = CanvasReviewRow & { nodes: TitleEmbed | TitleEmbed[] | null };
  const { canvas_reviews, ...version } = data as unknown as ReviewVersionRow & {
    canvas_reviews: ReviewEmbed | ReviewEmbed[];
  };
  const embed = Array.isArray(canvas_reviews) ? canvas_reviews[0] : canvas_reviews;
  if (!embed) return null;
  const { nodes, ...review } = embed;
  const node = Array.isArray(nodes) ? nodes[0] : nodes;
  const title = typeof node?.data?.title === "string" ? node.data.title : "";
  return { review: { ...review, title }, version };
}

export async function getReviewByNodeId(nodeId: string): Promise<CanvasReviewRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_reviews")
    .select(REVIEW_COLUMNS)
    .eq("node_id", nodeId)
    .maybeSingle();
  if (error) throw error;
  return (data as CanvasReviewRow | null) ?? null;
}

// The review row only — its cuts are versions (createVersion). A review left without a version
// (the version insert failed) heals itself: the next upload adds v1.
export async function createReview(input: {
  canvasId: string;
  nodeId: string;
  shareToken: string;
  createdBy: string;
}): Promise<CanvasReviewRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_reviews")
    .insert({
      canvas_id: input.canvasId,
      node_id: input.nodeId,
      share_token: input.shareToken,
      created_by: input.createdBy,
    })
    .select(REVIEW_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      // Two unique constraints: share_token (a code clash — retry longer) and node_id
      // (one cut per node). Postgres names the violated one in the message/details.
      const which = `${error.message ?? ""} ${error.details ?? ""}`;
      if (which.includes("share_token")) throw new ShareCodeTakenError();
      throw new ReviewExistsError();
    }
    throw error;
  }
  return data as CanvasReviewRow;
}


/** One version of a review, or null when the link names a version that doesn't exist. */
export async function getVersion(reviewId: string, versionNo: number): Promise<ReviewVersionRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_versions")
    .select(VERSION_COLUMNS)
    .eq("review_id", reviewId)
    .eq("version_no", versionNo)
    .maybeSingle();
  if (error) throw error;
  return (data as ReviewVersionRow | null) ?? null;
}

/** Every version of a review, newest first (the focus view's list order). */
export async function listVersions(reviewId: string): Promise<ReviewVersionRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_versions")
    .select(VERSION_COLUMNS)
    .eq("review_id", reviewId)
    .order("version_no", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReviewVersionRow[];
}

// Two uploads finishing together can both read the same highest number; the unique
// (review_id, version_no) refuses the second, which reads again and takes the next one.
const VERSION_INSERT_ATTEMPTS = 3;

/** D495 — the next version of a review: v1 for a new review, otherwise one past the highest. */
export async function createVersion(input: {
  reviewId: string;
  videoPath: string;
  title: string | null;
  allowDownload: boolean;
  createdBy: string;
}): Promise<ReviewVersionRow> {
  const supabase = createServerSupabase();
  for (let attempt = 0; attempt < VERSION_INSERT_ATTEMPTS; attempt++) {
    const { data: top, error: topErr } = await supabase
      .from("canvas_review_versions")
      .select("version_no")
      .eq("review_id", input.reviewId)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (topErr) throw topErr;
    const versionNo = ((top as { version_no: number } | null)?.version_no ?? 0) + 1;
    const { data, error } = await supabase
      .from("canvas_review_versions")
      .insert({
        review_id: input.reviewId,
        version_no: versionNo,
        video_path: input.videoPath,
        title: input.title,
        allow_download: input.allowDownload,
        created_by: input.createdBy,
      })
      .select(VERSION_COLUMNS)
      .single();
    if (!error) return data as ReviewVersionRow;
    if (error.code !== "23505") throw error;
  }
  throw new Error("Could not number the new version.");
}

/** A version's Allow download switch (D497) and/or its title. Null when the review has no such
 *  version. */
export async function updateVersion(
  reviewId: string,
  versionNo: number,
  patch: { allowDownload?: boolean; title?: string },
): Promise<ReviewVersionRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_versions")
    .update({
      ...(patch.allowDownload !== undefined && { allow_download: patch.allowDownload }),
      ...(patch.title !== undefined && { title: patch.title }),
    })
    .eq("review_id", reviewId)
    .eq("version_no", versionNo)
    .select(VERSION_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as ReviewVersionRow | null) ?? null;
}

const COMMENT_COLUMNS =
  "id, review_id, version_id, author_name, body, timecode_ms, edited_by_name, created_at, updated_at";

/** One version's comments — what its link shows (D496). */
export async function listComments(versionId: string): Promise<ReviewCommentRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_comments")
    .select(COMMENT_COLUMNS)
    .eq("version_id", versionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewCommentRow[];
}

/** Every version's comments, for the team's focus view (each row carries its version_id). */
export async function listReviewComments(reviewId: string): Promise<ReviewCommentRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_comments")
    .select(COMMENT_COLUMNS)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewCommentRow[];
}

// Head-only count — no rows travel; used to enforce MAX_COMMENTS_PER_VERSION.
export async function countComments(versionId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { count, error } = await supabase
    .from("canvas_review_comments")
    .select("id", { count: "exact", head: true })
    .eq("version_id", versionId);
  if (error) throw error;
  return count ?? 0;
}

export async function insertComment(input: {
  reviewId: string;
  versionId: string;
  authorName: string;
  body: string;
  timecodeMs: number;
}): Promise<ReviewCommentRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_comments")
    .insert({
      review_id: input.reviewId,
      version_id: input.versionId,
      author_name: input.authorName,
      body: input.body,
      timecode_ms: input.timecodeMs,
    })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw error;
  return data as ReviewCommentRow;
}

// Filtering on BOTH ids is the ownership check: a comment on another version (or another
// review) matches nothing, so a v1 link can never edit v2's comments.
export async function updateComment(input: {
  versionId: string;
  commentId: string;
  body: string;
  editedByName: string;
}): Promise<ReviewCommentRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_comments")
    .update({
      body: input.body,
      edited_by_name: input.editedByName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.commentId)
    .eq("version_id", input.versionId)
    .select(COMMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as ReviewCommentRow | null) ?? null;
}

// Every Client review node on a canvas with each version's comment count, in one query
// (PostgREST aggregate on the comments embedded under each version). Feeds the header's
// "Client feedback" chip.
export async function listCanvasClientFeedback(canvasId: string): Promise<CanvasClientFeedback> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_reviews")
    .select("node_id, nodes!inner(data), canvas_review_versions(version_no, title, canvas_review_comments(count))")
    .eq("canvas_id", canvasId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return toCanvasClientFeedback((data ?? []) as unknown as CanvasFeedbackRow[]);
}
