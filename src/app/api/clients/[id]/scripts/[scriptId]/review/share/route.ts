// src/app/api/clients/[id]/scripts/[scriptId]/review/share/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import { getLatestVersion, shareVersion } from "@/lib/db/script-reviews";
import { ensureScriptReview } from "@/lib/script-review/ensure-review";
import { collectVisuals } from "@/lib/script-review/visuals";
import { diffVersions } from "@/lib/script-review/version";
import { parseShare } from "@/lib/script-review/validate";
import { teamActorName } from "@/lib/script-review/actor";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

const NOT_IN_REVIEW = "Move the script to In review to share it.";

// POST /api/clients/:id/scripts/:scriptId/review/share — { scope } (spec 4 §3 steps 2–4). Freezes the
// script as it is now, with what the scope includes, as the next version on the script's one link.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not share the script.", async () => {
      const parsed = parseShare(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      // In review is reachable only from Visualise, so this also means "after Mark final" (spec 2 §8).
      if (script.stage !== "in_review") return apiError(NOT_IN_REVIEW, 409);

      const caller = await resolveCallerContext();
      const [review, actorName] = await Promise.all([
        ensureScriptReview({ scriptId: script.id, clientId, createdBy: caller.userId }),
        teamActorName(caller),
      ]);
      const prev = await getLatestVersion(review.id);
      const next = { scope: parsed.value.scope, doc: script.doc, visuals: await collectVisuals(clientId, script, parsed.value.scope) };
      const result = await shareVersion({
        reviewId: review.id,
        expectedLatest: prev?.number ?? 0,
        ...next,
        changes: diffVersions(prev, next),
        sharedBy: caller.userId,
        actorName,
      });
      if (result.status !== "ok") {
        return apiError(
          result.status === "stale" ? "Someone else shared a version just now. Reload, then share again." : NOT_IN_REVIEW,
          409,
        );
      }
      const { number, scope, sharedAt } = result.version;
      return apiOk({ version: { number, scope, sharedAt }, shareToken: review.share_token }, 201);
    }),
  );
}
