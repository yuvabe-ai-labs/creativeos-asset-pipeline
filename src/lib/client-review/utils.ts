import type { PublicReview, ReviewComment } from "./wire";

// m:ss for a comment's moment. Floors (not rounds) so the stamp matches the
// whole second the browser's video player shows at the paused frame.
export function formatCutTimecode(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Cache updates for a successful post / edit (src/hooks/queries/client-reviews.ts). The comment
// the server returned is shown at once, so a failed background refetch never invites a retry.
export function withAddedComment(
  review: PublicReview | undefined,
  comment: ReviewComment,
): PublicReview | undefined {
  if (!review || review.comments.some((c) => c.id === comment.id)) return review;
  return { ...review, comments: [...review.comments, comment] };
}

export function withEditedComment(
  review: PublicReview | undefined,
  comment: ReviewComment,
): PublicReview | undefined {
  if (!review) return review;
  return { ...review, comments: review.comments.map((c) => (c.id === comment.id ? comment : c)) };
}
