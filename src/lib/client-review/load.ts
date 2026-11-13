import "server-only";
import { listComments, type ReviewByToken } from "@/lib/db/client-reviews";
import { publicUrlFor } from "@/lib/storage";
import { toReviewComment, type PublicReview, type ReviewVersionRow } from "./wire";

// Shared by the public page (first, server-rendered load) and GET /api/r/[token]. One version
// only: nothing here says whether newer versions exist (D496).
export async function buildPublicReview(review: ReviewByToken, version: ReviewVersionRow): Promise<PublicReview> {
  const rows = await listComments(version.id);
  return {
    title: version.title || review.title,
    versionNo: version.version_no,
    videoUrl: publicUrlFor(version.video_path),
    allowDownload: version.allow_download,
    createdAt: version.created_at,
    comments: rows.map(toReviewComment),
  };
}
