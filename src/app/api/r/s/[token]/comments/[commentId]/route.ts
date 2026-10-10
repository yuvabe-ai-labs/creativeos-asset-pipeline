// src/app/api/r/s/[token]/comments/[commentId]/route.ts
import { apiError, apiOk, withQuietErrors, withScriptShareToken } from "@/lib/api/route-helpers";
import { getLatestVersion, hasApproval, updateClientComment } from "@/lib/db/script-reviews";
import { isUuid } from "@/lib/avatars/utils";
import { parseCommentEdit } from "@/lib/client-review/validate";
import { APPROVED_RECORD_ERROR } from "@/lib/script-review/constants";

// PATCH /api/r/s/:token/comments/:commentId — public (D356). Anyone with the link edits any client
// comment's TEXT (D309's rule, spec 4 §5); the part, the version and the author never change, and
// a team reply is not editable from the link.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string; commentId: string }> },
) {
  const { commentId } = await params;
  if (!isUuid(commentId)) return apiError("Comment not found.", 404);
  return withQuietErrors("Could not save the edit.", () =>
    withScriptShareToken(params, async (review) => {
      const parsed = parseCommentEdit(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const latest = await getLatestVersion(review.id);
      if (latest && (await hasApproval(review.script_id, latest.number))) return apiError(APPROVED_RECORD_ERROR, 409);
      const comment = await updateClientComment({
        reviewId: review.id,
        commentId,
        body: parsed.value.body,
        editedByName: parsed.value.editorName,
      });
      if (!comment) return apiError("Comment not found.", 404);
      return apiOk({ comment });
    }),
  );
}
