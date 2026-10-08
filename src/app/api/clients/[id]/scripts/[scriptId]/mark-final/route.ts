import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getGenerateScript, markScriptFinal } from "@/lib/db/script-generate";
import { fillToFinal } from "@/lib/scripts/copilot/fill-to-final";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// POST /api/clients/:id/scripts/:scriptId/mark-final — Generate → Visualise, spec 2's only stage
// change (§10). "Available only when the fill-to-final list (§8) is empty", checked here against the
// stored script, on the version checked, whatever the browser showed (D333).
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not mark the script final.", async () => {
      const script = await getGenerateScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      if (script.stage !== "generate") return apiError("This script is already final.", 409);
      const open = fillToFinal(script.doc, script.notes);
      if (open.length > 0) {
        const named = open.slice(0, 3).map((i) => i.label).join("; ") + (open.length > 3 ? "; …" : "");
        return apiError(`Not final yet: ${open.length} item${open.length === 1 ? " is" : "s are"} still open (${named}).`, 409);
      }
      if (!(await markScriptFinal(clientId, scriptId, script.docVersion))) {
        return apiError("The script changed while marking it final. Check it again.", 409);
      }
      return apiOk({ stage: "visualise" });
    }),
  );
}
