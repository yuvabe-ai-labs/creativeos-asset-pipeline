import { apiError, apiOk, withShareToken, withTryCatch } from "@/lib/api/route-helpers";
import { parseNewComment } from "@/lib/client-review/validate";
import { toReviewComment } from "@/lib/client-review/wire";
import { insertComment } from "@/lib/db/client-reviews";

// POST /api/r/:token/comments — public (D307). Add one comment at a paused frame.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withTryCatch("Could not post the comment.", () =>
    withShareToken(params, async (review) => {
      const parsed = parseNewComment(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const row = await insertComment({ reviewId: review.id, ...parsed.value });
      return apiOk({ comment: toReviewComment(row) }, 201);
    }),
  );
}
