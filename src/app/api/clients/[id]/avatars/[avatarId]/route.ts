import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { archiveAvatar, getAvatar, updateAvatar } from "@/lib/db/avatars";
import { listScriptsUsingAvatar } from "@/lib/db/script-visualise";
import { archiveRefusal } from "@/lib/scripts/visualise/cast";
import { LIKENESS_CONSENT_CHANGED_ERROR } from "@/lib/avatars/constants";
import { planAvatarUpdate, type AvatarPatch, type AvatarUpdateInput } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";

type Ctx = { params: Promise<{ id: string; avatarId: string }> };

const NOT_FOUND = "Avatar not found.";

// Lengths are checked by planAvatarUpdate, which words the message for the operator.
const PatchSchema = z.object({
  name: z.string().optional(),
  story: z.string().optional(),
  status: z.literal("ready").optional(),
  consent: z.object({ frontUrl: z.string().min(1) }).optional(),
});

// Whether the write must fail rather than land on a front image the caller never saw: a
// consent confirmation is for the specific photo `planAvatarUpdate` already matched, and
// marking an uploaded-front avatar ready must not write over a front that changed mid-request
// (D289 amended). Both need the same precondition — the avatar's CURRENT front image.
function frontPrecondition(
  current: Avatar, input: AvatarUpdateInput, patch: AvatarPatch,
): { ifFrontUrl?: string } {
  if (current.front?.source.kind !== "upload") return {};
  const confirmingConsent = input.consent !== undefined;
  const markingReady = patch.status === "ready";
  return confirmingConsent || markingReady ? { ifFrontUrl: current.front.url } : {};
}

// GET /api/clients/:id/avatars/:avatarId
export async function GET(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the avatar.", async () => {
      const avatar = await getAvatar(clientId, avatarId);
      // Missing or another client's: a 404 either way, never confirming a foreign id exists.
      if (!avatar) return apiError(NOT_FOUND, 404);
      return apiOk({ avatar });
    }),
  );
}

// PATCH /api/clients/:id/avatars/:avatarId — text fields, ready, and likeness consent.
// Images are changed by the images routes, never here.
export async function PATCH(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not save the avatar.", async () => {
      const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);

      const current = await getAvatar(clientId, avatarId);
      if (!current || current.archivedAt) return apiError(NOT_FOUND, 404);

      const caller = await resolveCallerContext();
      const plan = planAvatarUpdate(
        current, parsed.data, { userId: caller.userId, now: new Date().toISOString() },
      );
      if (!plan.ok) return apiError(plan.error, 400);

      const precondition = frontPrecondition(current, parsed.data, plan.patch);
      const avatar = await updateAvatar(clientId, avatarId, plan.patch, precondition);
      if (!avatar) {
        // `current`, above, confirms the row existed a moment ago — when the write carried a
        // front-image precondition, a null result means that precondition caught a race, not
        // that the avatar itself vanished.
        if (precondition.ifFrontUrl !== undefined) {
          return apiError(LIKENESS_CONSENT_CHANGED_ERROR, 409);
        }
        return apiError(NOT_FOUND, 404);
      }
      return apiOk({ avatar });
    }),
  );
}

// DELETE /api/clients/:id/avatars/:avatarId — archives (D287), unless a live script's cast uses
// the avatar (D346): archiving would leave that script's people without a face.
export async function DELETE(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not archive the avatar.", async () => {
      const refusal = archiveRefusal(await listScriptsUsingAvatar(clientId, avatarId));
      if (refusal) return apiError(refusal, 409);
      const archived = await archiveAvatar(clientId, avatarId);
      if (!archived) return apiError(NOT_FOUND, 404);
      return apiOk({ ok: true as const });
    }),
  );
}
