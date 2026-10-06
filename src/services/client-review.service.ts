import { authFetch } from "@/lib/supabase/session-ready";
import type { NodeClientReview, PublicReview, ReviewComment } from "@/lib/client-review/wire";
import { isNotFound, readJson } from "./read-json";

const JSON_HEADERS = { "Content-Type": "application/json" };
const EMPTY: NodeClientReview = { review: null, comments: [] };

// D309 client review share. Team reads go through the session (/api/nodes/:id/client-review);
// public reads and writes are scoped by the share token alone (/api/r/:token/...).
class ClientReviewService {
  /** The node's cut and its comments. A 404 means the node row isn't saved yet (autosave lag)
   *  — that is "no cut", not a failure. */
  async getForNode(nodeId: string): Promise<NodeClientReview> {
    // authFetch: this runs on canvas load alongside every other first request (session-ready.ts).
    const res = await authFetch(`/api/nodes/${nodeId}/client-review`, { cache: "no-store" });
    try {
      return await readJson<NodeClientReview>(res, "Couldn't load the review.");
    } catch (e) {
      if (isNotFound(e)) return EMPTY;
      throw e;
    }
  }

  async getPublic(token: string): Promise<PublicReview> {
    const res = await fetch(`/api/r/${token}`, { cache: "no-store" });
    return readJson<PublicReview>(res, "Could not load the review.");
  }

  async postComment(
    token: string,
    input: { authorName: string; body: string; timecodeMs: number },
  ): Promise<ReviewComment> {
    const res = await fetch(`/api/r/${token}/comments`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input),
    });
    const { comment } = await readJson<{ comment?: ReviewComment }>(res, "Could not post the comment.");
    if (!comment) throw new Error("Could not post the comment.");
    return comment;
  }

  /** Only the text changes; the moment and the original author never do. */
  async editComment(
    token: string,
    commentId: string,
    input: { editorName: string; body: string },
  ): Promise<ReviewComment> {
    const res = await fetch(`/api/r/${token}/comments/${commentId}`, {
      method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(input),
    });
    const { comment } = await readJson<{ comment?: ReviewComment }>(res, "Could not save the edit.");
    if (!comment) throw new Error("Could not save the edit.");
    return comment;
  }
}

export const clientReviewService = new ClientReviewService();
