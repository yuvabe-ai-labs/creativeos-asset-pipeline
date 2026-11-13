import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";
import { setVisualiseField } from "@/lib/db/script-visualise";
import { isDocTarget, parseFieldPath } from "@/lib/scripts/copilot/fields";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// GET /api/clients/:id/scripts/:scriptId/visualise — the script plus everything Visualise keeps
// beside it: the linked avatars, every take, the picks and the regional kits.
export async function GET(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the storyboard.", async () => {
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      return apiOk({ script, board: await loadVisualiseBoard(clientId, script) });
    }),
  );
}

// PATCH /api/clients/:id/scripts/:scriptId/visualise { path, value } — D489: one script text field
// typed on the Visualise board. Only the script's own fields (not the reel's notes), and only while
// the script is in Visualise; In review it is read-only.
export async function PATCH(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not save that change.", async () => {
      const body = (await req.json().catch(() => null)) as { path?: unknown; value?: unknown } | null;
      const target = typeof body?.path === "string" ? parseFieldPath(body.path) : null;
      if (!target || !isDocTarget(target)) return apiError("Unknown field.", 400);
      if (typeof body?.value !== "string" || body.value.length > 8000) return apiError("The value must be text under 8,000 characters.", 400);
      const result = await setVisualiseField(clientId, scriptId, target, body.value);
      if (!result.ok) return apiError(result.error, result.status);
      return apiOk({ script: result.script });
    }),
  );
}
