import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { changeGenerateScript, loadGenerateState } from "@/lib/db/script-generate";
import { parseFieldPath, writeField } from "@/lib/scripts/copilot/fields";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// PATCH /api/clients/:id/scripts/:scriptId/fields { path, value } — what the person types into the
// script or its notes (spec 2 §9 "Typing"), and the undo of an inline edit. One field, nothing else.
export async function PATCH(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not save that change.", async () => {
      const body = (await req.json().catch(() => null)) as { path?: unknown; value?: unknown } | null;
      const target = typeof body?.path === "string" ? parseFieldPath(body.path) : null;
      if (!target) return apiError("Unknown field.", 400);
      if (typeof body?.value !== "string" || body.value.length > 8000) return apiError("The value must be text under 8,000 characters.", 400);
      const value = body.value;

      const outcome = await changeGenerateScript(clientId, scriptId, (current) => {
        const written = writeField(current.doc, current.notes, target, value);
        if ("error" in written) return { error: written.error, status: 422 };
        return { patch: written.doc ? { doc: written.doc, notes: written.notes } : { notes: written.notes }, result: null };
      });
      if ("error" in outcome) return apiError(outcome.error, outcome.status);
      const state = await loadGenerateState(clientId, scriptId);
      return state ? apiOk({ state }) : apiError("Script not found.", 404);
    }),
  );
}
