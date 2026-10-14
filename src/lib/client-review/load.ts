import "server-only";
import { listComments, type ReviewByToken } from "@/lib/db/client-reviews";
import { publicUrlFor } from "@/lib/storage";
import { toReviewComment, type PublicReview } from "./wire";

// Shared by the public page (first, server-rendered load) and GET /api/r/[token].
export async function buildPublicReview(review: ReviewByToken): Promise<PublicReview> {
  const rows = await listComments(review.id);
  return {
    title: review.title,
    videoUrl: publicUrlFor(review.video_path),
    comments: rows.map(toReviewComment),
  };
}
