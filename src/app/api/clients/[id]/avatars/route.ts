import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { isKbReady, KB_NOT_READY_MESSAGE } from "@/lib/clients/kb-gate";
import { createDraftAvatar, listAvatars } from "@/lib/db/avatars";
import { AVATAR_NAME_MAX, AVATAR_STORY_MAX } from "@/lib/avatars/constants";

const CreateSchema = z.object({
  name: z.string().trim().max(AVATAR_NAME_MAX).optional(),
  story: z.string().trim().max(AVATAR_STORY_MAX).optional(),
});

// GET /api/clients/:id/avatars — the client's live avatars, drafts included.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, { need: "view" }, async (clientId) =>
    withTryCatch("Could not load the avatars.", async () =>
      apiOk({ avatars: await listAvatars(clientId) }),
    ),
  );
}

// POST /api/clients/:id/avatars — start a draft. Called by the Studio at the first upload,
// carrying whatever name and story were typed before it (D287).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, { need: "edit" }, async (clientId, client, caller) =>
    withTryCatch("Could not create the avatar.", async () => {
      if (!isKbReady(client)) return apiError(KB_NOT_READY_MESSAGE, 409); // D503
      const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const avatar = await createDraftAvatar({ clientId, userId: caller.userId, ...parsed.data });
      return apiOk({ avatar }, 201);
    }),
  );
}
