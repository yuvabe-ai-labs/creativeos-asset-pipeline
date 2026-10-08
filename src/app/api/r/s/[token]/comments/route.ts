// src/app/api/r/s/[token]/comments/route.ts
import { apiError, apiOk, withQuietErrors, withScriptShareToken } from "@/lib/api/route-helpers";
import { countScriptComments, getLatestVersion, hasApproval, insertScriptComment } from "@/lib/db/script-reviews";
import { MAX_COMMENTS_PER_REVIEW } from "@/lib/client-review/constants";
import {
  APPROVED_RECORD_ERROR, COMMENT_LIMIT_ERROR, PART_NOT_IN_VERSION_ERROR, STALE_VERSION_ERROR,
} from "@/lib/script-review/constants";
import { isPartInVersion } from "@/lib/script-review/parts";
import { parseNewScriptComment } from "@/lib/script-review/validate";

// POST /api/r/s/:token/comments — public (D355). One comment on one whole part of the version on
// the client's screen (spec 4 §5). The checks run in the app, not under the script lock: a comment
// that lands in the same instant as an approval is the one race left open, and it changes no stage.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return withQuietErrors("Could not post the comment.", () =>
    withScriptShareToken(params, async (review) => {
      const parsed = parseNewScriptComment(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const latest = await getLatestVersion(review.id);
      if (!latest) return apiError("Review not found.", 404);
      if (await hasApproval(review.script_id, latest.number)) return apiError(APPROVED_RECORD_ERROR, 409);
      if (parsed.value.versionNumber !== latest.number) return apiError(STALE_VERSION_ERROR, 409);
      if (!isPartInVersion(parsed.value.part, latest)) return apiError(PART_NOT_IN_VERSION_ERROR, 400);
      if ((await countScriptComments(review.id)) >= MAX_COMMENTS_PER_REVIEW) return apiError(COMMENT_LIMIT_ERROR, 409);
      const comment = await insertScriptComment({
        reviewId: review.id,
        versionId: latest.id,
        part: parsed.value.part,
        parentId: null,
        authorKind: "client",
        authorName: parsed.value.authorName,
        authorUserId: null,
        body: parsed.value.body,
      });
      return apiOk({ comment }, 201);
    }),
  );
}
