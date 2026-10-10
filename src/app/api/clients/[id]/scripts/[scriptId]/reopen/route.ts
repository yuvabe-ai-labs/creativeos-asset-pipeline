import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { reopenScript } from "@/lib/db/script-visualise";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

const ONLY_VISUALISE = "Only a script in Visualise can be reopened.";

// POST /api/clients/:id/scripts/:scriptId/reopen — D347: Visualise → Generate, so the script's
// text can change (spec 2 owns editing). Avatars, panels and takes are kept; the panels of
// shots that change are marked out of date when the script comes back (D344).
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not reopen the script.", async () => {
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      if (script.stage !== "visualise") return apiError(ONLY_VISUALISE, 409);
      const reopened = await reopenScript(clientId, scriptId);
      if (!reopened) return apiError(ONLY_VISUALISE, 409);
      return apiOk({ script: reopened });
    }),
  );
}
