import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getAvatar } from "@/lib/db/avatars";
import { setCastAvatar } from "@/lib/db/script-visualise";

type Ctx = { params: Promise<{ id: string; scriptId: string; castId: string }> };

const Body = z.object({ avatarId: z.uuid().nullable() });

// PUT /api/clients/:id/scripts/:scriptId/cast/:castId — D337: the one write Visualise makes into
// a script, a cast member's avatar link. The avatar must be this client's and not archived;
// drafts are allowed, because the inline maker links its draft as soon as it exists.
export async function PUT(req: Request, { params }: Ctx) {
  const { scriptId, castId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not change the avatar.", async () => {
      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const { avatarId } = parsed.data;
      if (avatarId) {
        const avatar = await getAvatar(clientId, avatarId);
        if (!avatar || avatar.archivedAt) return apiError("Avatar not found.", 404);
      }
      const result = await setCastAvatar(clientId, scriptId, castId, avatarId);
      if (!result.ok) return apiError(result.error, result.status);
      return apiOk({ script: result.script });
    }),
  );
}
