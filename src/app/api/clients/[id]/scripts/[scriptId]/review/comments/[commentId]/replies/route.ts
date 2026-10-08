// src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/replies/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import {
  countScriptComments, getCommentForReply, getScriptReviewForScript, insertScriptComment,
} from "@/lib/db/script-reviews";
import { isUuid } from "@/lib/avatars/utils";
import { MAX_COMMENTS_PER_REVIEW } from "@/lib/client-review/constants";
import { COMMENT_LIMIT_ERROR } from "@/lib/script-review/constants";
import { parseReply } from "@/lib/script-review/validate";
import { teamActorName } from "@/lib/script-review/actor";

type Ctx = { params: Promise<{ id: string; scriptId: string; commentId: string }> };

// POST …/review/comments/:commentId/replies — { body } (spec 4 §5 Threads). The team replies under a
// client's comment; the reply belongs to that thread's version and part.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId, commentId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not post the reply.", async () => {
      const parsed = parseReply(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      const review = await getScriptReviewForScript(script.id);
      if (!review || !isUuid(commentId)) return apiError("Comment not found.", 404);
      const parent = await getCommentForReply(review.id, commentId);
      if (!parent) return apiError("Comment not found.", 404);
      if (parent.parentId) return apiError("Reply to the thread's first comment.", 400);
      // The team may reply after approval too (user, 8 Oct); only the client's link becomes a record.
      if ((await countScriptComments(review.id)) >= MAX_COMMENTS_PER_REVIEW) return apiError(COMMENT_LIMIT_ERROR, 409);
      const caller = await resolveCallerContext();
      const comment = await insertScriptComment({
        reviewId: review.id,
        versionId: parent.versionId,
        part: parent.part,
        parentId: parent.id,
        authorKind: "team",
        authorName: await teamActorName(caller),
        authorUserId: caller.userId,
        body: parsed.value.body,
      });
      return apiOk({ comment }, 201);
    }),
  );
}
