import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getGenerateScript, markScriptFinal } from "@/lib/db/script-generate";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// POST /api/clients/:id/scripts/:scriptId/mark-final — Generate → Visualise, spec 2's only stage
// change (§10). Any drafted script can move (D363, revising D333): what is still open (§8) no longer
// blocks it. The browser names the open items and asks first, and they stay in the notes. The move
// happens only on the version read here, so an edit landing meanwhile stops it.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not mark the script final.", async () => {
      const script = await getGenerateScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      if (script.stage !== "generate") return apiError("This script is already final.", 409);
      if (!script.doc) return apiError("There's no draft to mark final yet.", 409);
      if (!(await markScriptFinal(clientId, scriptId, script.docVersion))) {
        return apiError("The script changed while marking it final. Check it again.", 409);
      }
      return apiOk({ stage: "visualise" });
    }),
  );
}
