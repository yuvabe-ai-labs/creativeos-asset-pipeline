// DB rows and the JSON shapes that leave the server. Pure — safe to import anywhere.

export type CanvasReviewRow = {
  id: string;
  canvas_id: string;
  node_id: string;
  org_id: string;
  share_token: string;
  created_by: string;
  created_at: string;
};

// D495: one row per uploaded cut. The cut, its download switch and its comments live here.
export type ReviewVersionRow = {
  id: string;
  review_id: string;
  version_no: number;
  video_path: string;
  title: string | null;
  allow_download: boolean;
  legacy_link: boolean;
  created_by: string;
  created_at: string;
};

export type ReviewCommentRow = {
  id: string;
  review_id: string;
  version_id: string;
  author_name: string;
  body: string;
  timecode_ms: number;
  edited_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewComment = {
  id: string;
  versionId: string;
  authorName: string;
  body: string;
  timecodeMs: number;
  editedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

// Public payload: deliberately no org / client / canvas / node ids (spec §3).
// D496: one version only — the payload never says whether newer versions exist.
export type PublicReview = {
  title: string;
  versionNo: number;
  videoUrl: string;
  allowDownload: boolean;
  createdAt: string;
  comments: ReviewComment[];
};

// Team view of one version (the focus view's version list and stage).
export type ReviewVersion = {
  id: string;
  versionNo: number;
  /** The cut's own name (its file name at upload); null = use the node's title. */
  title: string | null;
  videoUrl: string;
  allowDownload: boolean;
  /** A v1 moved from a pre-version review: its link has no "-v1" (D496). */
  legacyLink: boolean;
  createdAt: string;
};

// Team payload for the canvas node + focus view. The share CODE, not a finished link: the link
// carries the node's title (D311), and only the client knows the title the operator is looking
// at right now. A server-built link went stale on rename until the page reloaded.
// Versions are newest first; comments carry their versionId (all versions, oldest first).
export type NodeClientReview = {
  review: { shareToken: string; versions: ReviewVersion[] } | null;
  comments: ReviewComment[];
};

export function toReviewComment(row: ReviewCommentRow): ReviewComment {
  return {
    id: row.id,
    versionId: row.version_id,
    authorName: row.author_name,
    body: row.body,
    timecodeMs: row.timecode_ms,
    editedByName: row.edited_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toReviewVersion(row: ReviewVersionRow, videoUrl: string): ReviewVersion {
  return {
    id: row.id,
    versionNo: row.version_no,
    title: row.title,
    videoUrl,
    allowDownload: row.allow_download,
    legacyLink: row.legacy_link,
    createdAt: row.created_at,
  };
}

// Canvas-level summary for the header's "Client feedback" chip: every Client review node on
// the canvas with its comment count. The count is the TOTAL (operator decision 2026-10-06),
// not "unseen" — there is no seen-state. Each node lists its versions newest first with their
// own counts (D500), so the chip opens the version the comments are on.
export type CanvasFeedbackVersion = { versionNo: number; title: string | null; count: number };
export type CanvasFeedbackNode = {
  nodeId: string;
  title: string;
  count: number;
  versions: CanvasFeedbackVersion[];
};
export type CanvasClientFeedback = { nodes: CanvasFeedbackNode[]; total: number };

type TitleEmbed = { data: { title?: unknown } | null };
export type CanvasFeedbackRow = {
  node_id: string;
  nodes: TitleEmbed | TitleEmbed[] | null;
  canvas_review_versions:
    | { version_no: number; title: string | null; canvas_review_comments: { count: number }[] | null }[]
    | null;
};

export function toCanvasClientFeedback(rows: CanvasFeedbackRow[]): CanvasClientFeedback {
  const nodes = rows.map((r) => {
    const node = Array.isArray(r.nodes) ? r.nodes[0] : r.nodes;
    const title = typeof node?.data?.title === "string" ? node.data.title : "";
    const versions = (r.canvas_review_versions ?? [])
      .map((v) => ({
        versionNo: v.version_no,
        title: v.title,
        count: v.canvas_review_comments?.[0]?.count ?? 0,
      }))
      .sort((a, b) => b.versionNo - a.versionNo);
    const count = versions.reduce((sum, v) => sum + v.count, 0);
    return { nodeId: r.node_id, title, count, versions };
  });
  return { nodes, total: nodes.reduce((sum, n) => sum + n.count, 0) };
}
