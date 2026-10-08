// src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import { getScriptReviewForScript, setThreadResolved } from "@/lib/db/script-reviews";
import { isUuid } from "@/lib/avatars/utils";
import { parseResolve } from "@/lib/script-review/validate";
import { teamActorName } from "@/lib/script-review/actor";

type Ctx = { params: Promise<{ id: string; scriptId: string; commentId: string }> };

// PATCH …/review/comments/:commentId — { resolved } (spec 4 §5). The team marks a thread Resolved,
// or reopens it; the client sees the mark.
export async function PATCH(req: Request, { params }: Ctx) {
  const { scriptId, commentId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not update the thread.", async () => {
      const parsed = parseResolve(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      const review = await getScriptReviewForScript(script.id);
      if (!review || !isUuid(commentId)) return apiError("Comment not found.", 404);
      // The team may resolve after approval too (user, 8 Oct).
      const byName = parsed.value.resolved ? await teamActorName(await resolveCallerContext()) : null;
      const comment = await setThreadResolved({ reviewId: review.id, commentId, resolved: parsed.value.resolved, byName });
      if (!comment) return apiError("Comment not found.", 404);
      return apiOk({ comment });
    }),
  );
}
