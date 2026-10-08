// src/app/api/clients/[id]/scripts/[scriptId]/review/stage/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import { moveScriptStage } from "@/lib/db/script-reviews";
import { SCRIPT_STAGE_LABEL } from "@/lib/scripts/constants";
import { TEAM_STAGE_MOVES } from "@/lib/script-review/constants";
import { parseStageMove } from "@/lib/script-review/validate";
import { teamActorName } from "@/lib/script-review/actor";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// POST /api/clients/:id/scripts/:scriptId/review/stage — { move } (spec 4 §3, §8): Visualise → In
// review, In review → Visualise, Approved → Visualise. Approve is the client's, never this route.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not move the script.", async () => {
      const parsed = parseStageMove(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      const rule = TEAM_STAGE_MOVES[parsed.value.move];
      if (script.stage !== rule.from) {
        return apiError(
          `${rule.label} works from ${SCRIPT_STAGE_LABEL[rule.from]}; this script is at ${SCRIPT_STAGE_LABEL[script.stage]}.`,
          409,
        );
      }
      const actorName = await teamActorName(await resolveCallerContext());
      const moved = await moveScriptStage({ scriptId: script.id, clientId, from: rule.from, to: rule.to, event: rule.event, actorName });
      if (!moved) return apiError("Someone else just moved this script. Reload to see where it is.", 409);
      return apiOk({ stage: rule.to });
    }),
  );
}
