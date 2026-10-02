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

// Team payload for the canvas node + focus view.
export type NodeClientReview = {
  review: { videoUrl: string; sharePath: string } | null;
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
