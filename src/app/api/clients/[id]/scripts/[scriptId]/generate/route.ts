import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { loadGenerateState } from "@/lib/db/script-generate";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// GET /api/clients/:id/scripts/:scriptId/generate — the Generate workspace: the script (with or
// without a draft), its brief and notes, the conversation, the open items and the castable avatars.
export async function GET(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the script.", async () => {
      const state = await loadGenerateState(clientId, scriptId);
      return state ? apiOk({ state }) : apiError("Script not found.", 404);
    }),
  );
}
