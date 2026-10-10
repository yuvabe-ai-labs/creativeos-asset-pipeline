// src/app/api/clients/[id]/scripts/[scriptId]/review/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { getScriptReviewForScript } from "@/lib/db/script-reviews";
import { loadReviewState } from "@/lib/script-review/load";
import { assembleTeam } from "@/lib/script-review/assemble";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// GET /api/clients/:id/scripts/:scriptId/review — the team's view of the client review: stage, the
// link's code, the latest version, comments, activity, approval and the feedback count (spec 4 §6).
export async function GET(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the review.", async () => {
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      const review = await getScriptReviewForScript(script.id);
      const state = await loadReviewState(review?.id ?? null, script.id);
      return apiOk({
        review: assembleTeam(state, { stage: script.stage, shareToken: review?.share_token ?? null, liveDoc: script.doc }),
      });
    }),
  );
}
