// src/app/api/r/s/[token]/approve/route.ts
import { apiError, apiOk, withQuietErrors, withScriptShareToken } from "@/lib/api/route-helpers";
import { approveVersion } from "@/lib/db/script-reviews";
import { STALE_VERSION_ERROR } from "@/lib/script-review/constants";
import { parseApproval } from "@/lib/script-review/validate";

// POST /api/r/s/:token/approve — public (D353). Approves the version number the client's screen
// shows, under their typed name; script_review_approve checks and writes under the script lock.
// Approval moves the script to Approved, which is what puts it in the canvas gallery's Scripts tab.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return withQuietErrors("Could not approve the reel.", () =>
    withScriptShareToken(params, async (review) => {
      const parsed = parseApproval(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const status = await approveVersion({
        reviewId: review.id,
        versionNumber: parsed.value.versionNumber,
        actorName: parsed.value.approverName,
      });
      switch (status) {
        case "ok":
        case "already":
          return apiOk({ approved: true });
        case "stale":
          return apiError(STALE_VERSION_ERROR, 409);
        case "partial":
          return apiError("This share is for comments. You approve the full reel: script, avatars and panels.", 409);
        case "not_in_review":
          return apiError("This reel is not waiting for your approval right now.", 409);
        case "not_found":
          return apiError("Review not found.", 404);
      }
    }),
  );
}
