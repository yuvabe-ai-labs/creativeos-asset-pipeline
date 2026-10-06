import { apiError, apiOk, withShareToken, withTryCatch } from "@/lib/api/route-helpers";
import { parseCommentEdit } from "@/lib/client-review/validate";
import { toReviewComment } from "@/lib/client-review/wire";
import { updateComment } from "@/lib/db/client-reviews";

// PATCH /api/r/:token/comments/:commentId — public (D307). Anyone with the link may
// edit any comment's TEXT; the moment and original author are never editable.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string; commentId: string }> },
) {
  const { commentId } = await params;
  return withTryCatch("Could not save the edit.", () =>
    withShareToken(params, async (review) => {
      const parsed = parseCommentEdit(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const row = await updateComment({
        reviewId: review.id,
        commentId,
        body: parsed.value.body,
        editedByName: parsed.value.editorName,
      });
      if (!row) return apiError("Comment not found.", 404);
      return apiOk({ comment: toReviewComment(row) });
    }),
  );
}
