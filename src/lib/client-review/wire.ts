// DB rows and the JSON shapes that leave the server. Pure — safe to import anywhere.

export type CanvasReviewRow = {
  id: string;
  canvas_id: string;
  node_id: string;
  org_id: string;
  video_path: string;
  share_token: string;
  created_by: string;
  created_at: string;
};

export type ReviewCommentRow = {
  id: string;
  review_id: string;
  author_name: string;
  body: string;
  timecode_ms: number;
  edited_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewComment = {
  id: string;
  authorName: string;
  body: string;
  timecodeMs: number;
  editedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

// Public payload: deliberately no org / client / canvas / node ids (spec §3).
export type PublicReview = {
  title: string;
  videoUrl: string;
  comments: ReviewComment[];
};

// Team payload for the canvas node + focus view. The share CODE, not a finished link: the link
// carries the node's title (D311), and only the client knows the title the operator is looking
// at right now. A server-built link went stale on rename until the page reloaded.
export type NodeClientReview = {
  review: { videoUrl: string; shareToken: string } | null;
  comments: ReviewComment[];
};

export function toReviewComment(row: ReviewCommentRow): ReviewComment {
  return {
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    timecodeMs: row.timecode_ms,
    editedByName: row.edited_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Canvas-level summary for the header's "Client feedback" chip: every Client review node on
// the canvas with its comment count. The count is the TOTAL (operator decision 2026-10-06),
// not "unseen" — there is no seen-state.
export type CanvasFeedbackNode = { nodeId: string; title: string; count: number };
export type CanvasClientFeedback = { nodes: CanvasFeedbackNode[]; total: number };

type TitleEmbed = { data: { title?: unknown } | null };
export type CanvasFeedbackRow = {
  node_id: string;
  nodes: TitleEmbed | TitleEmbed[] | null;
  canvas_review_comments: { count: number }[] | null;
};

export function toCanvasClientFeedback(rows: CanvasFeedbackRow[]): CanvasClientFeedback {
  const nodes = rows.map((r) => {
    const node = Array.isArray(r.nodes) ? r.nodes[0] : r.nodes;
    const title = typeof node?.data?.title === "string" ? node.data.title : "";
    return { nodeId: r.node_id, title, count: r.canvas_review_comments?.[0]?.count ?? 0 };
  });
  return { nodes, total: nodes.reduce((sum, n) => sum + n.count, 0) };
}
