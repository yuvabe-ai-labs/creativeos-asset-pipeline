import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { changeGenerateScript, loadGenerateState } from "@/lib/db/script-generate";
import { getAvatar } from "@/lib/db/avatars";
import { isUuid } from "@/lib/avatars/utils";
import { applyOps } from "@/lib/scripts/copilot/ops";
import { newShotId } from "@/lib/scripts/copilot/draft";

type Ctx = { params: Promise<{ id: string; scriptId: string; castId: string }> };

// PATCH /api/clients/:id/scripts/:scriptId/cast/:castId { avatarId } — "The person can always change
// the link: swap to another Avatar, or unlink to words only so spec 3 makes a new one" (spec 2 §4.4).
// Only a saved (ready) avatar of this client can be linked. The description is left as written.
export async function PATCH(req: Request, { params }: Ctx) {
  const { scriptId, castId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not change the avatar.", async () => {
      const body = (await req.json().catch(() => null)) as { avatarId?: unknown } | null;
      const avatarId = body?.avatarId ?? null;
      if (avatarId !== null && (typeof avatarId !== "string" || !isUuid(avatarId))) return apiError("Unknown avatar.", 400);
      if (avatarId !== null) {
        const avatar = await getAvatar(clientId, avatarId);
        if (!avatar || avatar.status !== "ready" || avatar.archivedAt) return apiError("Pick one of the client's saved avatars.", 422);
      }

      const outcome = await changeGenerateScript(clientId, scriptId, (current) => {
        if (!current.doc) return { error: "There's no draft yet.", status: 409 };
        const r = applyOps(current.doc, current.notes, [{
          op: "link_avatar", path: null, value: null, shotId: null, afterShotId: null, shot: null, second: null, list: null, itemId: null,
          cast: { castId, name: "", description: "", avatarId },
        }], { newShotId, avatarIds: new Set(avatarId ? [avatarId] : []) });
        if (!r.ok) return { error: r.error, status: 404 };
        return { patch: { doc: r.doc }, result: null };
      });
      if ("error" in outcome) return apiError(outcome.error, outcome.status);
      const state = await loadGenerateState(clientId, scriptId);
      return state ? apiOk({ state }) : apiError("Script not found.", 404);
    }),
  );
}
