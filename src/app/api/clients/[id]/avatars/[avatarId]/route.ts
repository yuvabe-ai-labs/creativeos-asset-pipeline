import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { archiveAvatar, getAvatar, updateAvatar } from "@/lib/db/avatars";
import { planAvatarUpdate } from "@/lib/avatars/utils";

type Ctx = { params: Promise<{ id: string; avatarId: string }> };

const NOT_FOUND = "Avatar not found.";

// Lengths are checked by planAvatarUpdate, which words the message for the operator.
const PatchSchema = z.object({
  name: z.string().optional(),
  story: z.string().optional(),
  status: z.literal("ready").optional(),
  consent: z.literal(true).optional(),
});

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

      const avatar = await updateAvatar(clientId, avatarId, plan.patch);
      if (!avatar) return apiError(NOT_FOUND, 404);
      return apiOk({ avatar });
    }),
  );
}

// DELETE /api/clients/:id/avatars/:avatarId — archives (D287).
export async function DELETE(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not archive the avatar.", async () => {
      const archived = await archiveAvatar(clientId, avatarId);
      if (!archived) return apiError(NOT_FOUND, 404);
      return apiOk({ ok: true as const });
    }),
  );
}
