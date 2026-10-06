import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  toCanvasClientFeedback,
  type CanvasClientFeedback,
  type CanvasFeedbackRow,
  type CanvasReviewRow,
  type ReviewCommentRow,
} from "@/lib/client-review/wire";

export type ReviewByToken = CanvasReviewRow & { title: string };

export class ReviewExistsError extends Error {
  constructor() {
    super("This node already has a cut.");
  }
}

// D311: share codes are short, so two nodes can want the same one. The finalize route
// catches this and retries one character longer.
export class ShareCodeTakenError extends Error {
  constructor() {
    super("That share code is taken.");
  }
}

const REVIEW_COLUMNS = "id, canvas_id, node_id, org_id, video_path, share_token, created_by, created_at";

// The cut's title is the node's own title (spec §5) — read it from nodes.data.
export async function getReviewByToken(token: string): Promise<ReviewByToken | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_reviews")
    .select(`${REVIEW_COLUMNS}, nodes!inner(data)`)
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { nodes, ...review } = data as unknown as CanvasReviewRow & {
    nodes: { data: { title?: unknown } } | { data: { title?: unknown } }[] | null;
  };
  const node = Array.isArray(nodes) ? nodes[0] : nodes;
  const title = typeof node?.data?.title === "string" ? node.data.title : "";
  return { ...review, title };
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

export async function createReview(input: {
  canvasId: string;
  nodeId: string;
  videoPath: string;
  shareToken: string;
  createdBy: string;
}): Promise<CanvasReviewRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_reviews")
    .insert({
      canvas_id: input.canvasId,
      node_id: input.nodeId,
      video_path: input.videoPath,
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

const COMMENT_COLUMNS =
  "id, review_id, author_name, body, timecode_ms, edited_by_name, created_at, updated_at";

export async function listComments(reviewId: string): Promise<ReviewCommentRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_comments")
    .select(COMMENT_COLUMNS)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewCommentRow[];
}

// Head-only count — no rows travel; used to enforce MAX_COMMENTS_PER_REVIEW.
export async function countComments(reviewId: string): Promise<number> {
  const supabase = createServerSupabase();
  const { count, error } = await supabase
    .from("canvas_review_comments")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId);
  if (error) throw error;
  return count ?? 0;
}

export async function insertComment(input: {
  reviewId: string;
  authorName: string;
  body: string;
  timecodeMs: number;
}): Promise<ReviewCommentRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_comments")
    .insert({
      review_id: input.reviewId,
      author_name: input.authorName,
      body: input.body,
      timecode_ms: input.timecodeMs,
    })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw error;
  return data as ReviewCommentRow;
}

// Filtering on BOTH ids is the ownership check: a comment from another review
// matches nothing, so a token can never edit outside its own review.
export async function updateComment(input: {
  reviewId: string;
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
    .eq("review_id", input.reviewId)
    .select(COMMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as ReviewCommentRow | null) ?? null;
}

// Every Client review node on a canvas with its comment count, in one query (PostgREST
// aggregate on the embedded comments). Feeds the header's "Client feedback" chip.
export async function listCanvasClientFeedback(canvasId: string): Promise<CanvasClientFeedback> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_reviews")
    .select("node_id, nodes!inner(data), canvas_review_comments(count)")
    .eq("canvas_id", canvasId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return toCanvasClientFeedback((data ?? []) as unknown as CanvasFeedbackRow[]);
}
