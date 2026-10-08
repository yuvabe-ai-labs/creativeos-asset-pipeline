import { apiError, apiOk, withShareToken, withQuietErrors } from "@/lib/api/route-helpers";
import { MAX_COMMENTS_PER_REVIEW } from "@/lib/client-review/constants";
import { parseNewComment } from "@/lib/client-review/validate";
import { toReviewComment } from "@/lib/client-review/wire";
import { countComments, insertComment } from "@/lib/db/client-reviews";

// POST /api/r/:token/comments — public (D309). Add one comment at a paused frame.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withQuietErrors("Could not post the comment.", () =>
    withShareToken(params, async (review) => {
      const parsed = parseNewComment(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      if ((await countComments(review.id)) >= MAX_COMMENTS_PER_REVIEW) {
        return apiError("This review has reached its comment limit.", 409);
      }
      const row = await insertComment({ reviewId: review.id, ...parsed.value });
      return apiOk({ comment: toReviewComment(row) }, 201);
    }),
  );
}
