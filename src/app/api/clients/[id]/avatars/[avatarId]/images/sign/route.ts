import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getAvatar } from "@/lib/db/avatars";
import { signAvatarImageUpload } from "@/lib/storage";
import { validateAvatarImageFile } from "@/lib/avatars/utils";
import { AVATAR_IMAGE_CONTENT_TYPES } from "@/lib/avatars/constants";

const SignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().nonnegative(),
  // D340 — sheets are four generated views; only the front is uploaded.
  slot: z.enum(["front"]),
});

// POST /api/clients/:id/avatars/:avatarId/images/sign — validate, then hand back a signed URL
// for a direct browser -> GCS upload. Bytes never pass through the app.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not authorize the upload.", async () => {
      const parsed = SignSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const { filename, contentType, size, slot } = parsed.data;

      const invalid = validateAvatarImageFile({ name: filename, size });
      if (invalid) return apiError(invalid, 400);

      if (!AVATAR_IMAGE_CONTENT_TYPES.has(contentType)) {
        return apiError(
          `Unsupported content type '${contentType}'. Allowed: ${[...AVATAR_IMAGE_CONTENT_TYPES].join(", ")}.`,
          400,
        );
      }

      const avatar = await getAvatar(clientId, avatarId);
      if (!avatar || avatar.archivedAt) return apiError("Avatar not found.", 404);

      const signed = await signAvatarImageUpload({
        clientId, avatarId, slot, filename, contentType,
      });
      return apiOk(signed);
    }),
  );
}
