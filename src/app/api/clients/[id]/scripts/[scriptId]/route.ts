import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { getAvatar } from "@/lib/db/avatars";
import { archiveUnwrittenScript, getGenerateScript } from "@/lib/db/script-generate";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// GET /api/clients/:id/scripts/:scriptId — one script, plus the lead's avatar id when that
// avatar can go on a canvas: this client's, ready, not archived (spec 1 §5.4). Otherwise null,
// and the script still arrives without an avatar.
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
      return apiOk({ script, leadAvatarId });
    }),
  );
}

// DELETE /api/clients/:id/scripts/:scriptId — Delete in the library, for a script the copilot has
// not written yet: it is archived, so it leaves every list. A drafted script is refused (409).
export async function DELETE(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not delete the script.", async () => {
      if (await archiveUnwrittenScript(clientId, scriptId)) return apiOk({ ok: true as const });
      // Nothing archived: say why only for a script this client still has.
      if (await getGenerateScript(clientId, scriptId)) return apiError("This script has a draft now, so it can't be deleted.", 409);
      return apiError("Script not found.", 404);
    }),
  );
}
