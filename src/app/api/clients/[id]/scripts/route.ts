import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { listScripts } from "@/lib/db/scripts";
import { isScriptStage } from "@/lib/scripts/constants";

// GET /api/clients/:id/scripts[?stage=approved] — the client's live scripts. The canvas
// gallery's Scripts tab asks for approved ones only (spec 1 §5.1).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the scripts.", async () => {
      const stage = new URL(req.url).searchParams.get("stage");
      if (stage !== null && !isScriptStage(stage)) return apiError("Unknown stage.", 400);
      return apiOk({ scripts: await listScripts(clientId, stage ? { stage } : {}) });
    }),
  );
}
