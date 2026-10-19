import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { deleteScript, getScript } from "@/lib/db/scripts";
import { getAvatar } from "@/lib/db/avatars";
import { loadApprovedStoryboard } from "@/lib/scripts/storyboard-server";
import { SCRIPT_DELETE_BLOCKED } from "@/lib/scripts/constants";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// GET /api/clients/:id/scripts/:scriptId — one script, plus the lead's avatar id when that
// avatar can go on a canvas: this client's, ready, not archived (spec 1 §5.4). Otherwise null,
// and the script still arrives without an avatar. Also the approved storyboard (D381): the
// panels the client approved, named by shot, or [] when there are none.
export async function GET(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the script.", async () => {
      const script = await getScript(clientId, scriptId);
      // Missing or another client's: a 404 either way, never confirming a foreign id exists.
      if (!script) return apiError("Script not found.", 404);
      const lead = script.doc.cast.find((c) => c.isLead);
      const avatar = lead?.avatarId ? await getAvatar(clientId, lead.avatarId) : null;
      const leadAvatarId = avatar && avatar.status === "ready" && !avatar.archivedAt ? avatar.id : null;
      const storyboard = await loadApprovedStoryboard(script);
      return apiOk({ script, leadAvatarId, storyboard });
    }),
  );
}

// DELETE /api/clients/:id/scripts/:scriptId — D384: delete a script for good, at any stage, from
// its library card. Refused (409, with the reason) when a canvas was started from it, it has been
// shared with the client, or a panel is being drawn; the database decides all three under one lock.
export async function DELETE(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not delete the script.", async () => {
      const result = await deleteScript(clientId, scriptId);
      if (result === "deleted") return apiOk({ ok: true as const });
      if (result === "not_found") return apiError("Script not found.", 404);
      return apiError(SCRIPT_DELETE_BLOCKED[result], 409);
    }),
  );
}
