import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { listScripts } from "@/lib/db/scripts";
import { isScriptStage } from "@/lib/scripts/constants";
import { resolveCallerContext } from "@/lib/dal";
import { createGenerateScript } from "@/lib/db/script-generate";
import { loadCopilotContext } from "@/lib/scripts/copilot/context";
import { libraryFormats } from "@/lib/scripts/copilot/prompt-context";
import { openingMessage } from "@/lib/scripts/copilot/brief";
import { EMPTY_BRIEF, EMPTY_NOTES } from "@/lib/scripts/copilot/schema";

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

// POST /api/clients/:id/scripts — New script (spec 2 §3): an empty script at Generate, with the
// copilot's opening already in its conversation. The copilot is the only way a script is made.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not start a new script.", async () => {
      const { userId } = await resolveCallerContext();
      const ctx = await loadCopilotContext(client);
      const opening = openingMessage({ clientName: client.name, formats: libraryFormats(ctx.library).map((f) => f.format), hasKb: ctx.hasKb });
      const script = await createGenerateScript({ clientId, userId, brief: EMPTY_BRIEF, notes: EMPTY_NOTES, opening });
      return apiOk({ scriptId: script.id }, 201);
    }),
  );
}
