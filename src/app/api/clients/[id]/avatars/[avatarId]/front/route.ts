import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { getAvatarGeneration } from "@/lib/db/generations";
import { removeObject } from "@/lib/storage";
import { generationToCandidate, generationToImage } from "@/lib/avatars/rows";
import { frontChangePatch, withStatus } from "@/lib/avatars/utils";

const PickSchema = z.object({ generationId: z.string().min(1) });

// POST …/front — make a generated candidate the avatar's front image. The image is looked up
// from the avatar's own generations, never taken as a URL from the browser.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not set the front image.", async () => {
      const parsed = PickSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);

      const current = await getAvatar(clientId, avatarId);
      if (!current || current.archivedAt) return apiError("Avatar not found.", 404);

      // Scoped to this avatar: another avatar's generation is a 404, never confirmed to exist.
      const generation = await getAvatarGeneration(avatarId, parsed.data.generationId);
      if (!generation) return apiError("Generated image not found.", 404);
      const image = generationToCandidate(generation) ? generationToImage(generation) : null;
      if (!image) return apiError("That image cannot be used as a front image.", 400);

      // frontChangePatch makes the avatar generic, clears consent and stales the sheet.
      // Conditioned on the front THIS request read: a concurrent front pick or a consent/ready
      // PATCH landing in between must not be overwritten by a write planned from a stale read
      // (`current.front === null` on a fresh draft becomes the "front is still empty" form).
      const avatar = await updateAvatar(
        clientId,
        avatarId,
        withStatus(current, frontChangePatch(current, image)),
        { ifFrontUrl: current.front?.url ?? null },
      );
      if (!avatar) {
        // `current`, above, confirms the row existed a moment ago — a null result here means
        // the front precondition caught a race, not that the avatar itself vanished, unless it
        // was archived or deleted in between (the same distinction the PATCH route draws).
        const stillThere = await getAvatar(clientId, avatarId);
        if (stillThere) return apiError("The front image changed. Pick again.", 409);
        return apiError("Avatar not found.", 404);
      }

      // An uploaded photo it replaces is removed; a generated one stays — its batch still shows it.
      const replaced = current.front;
      if (replaced?.source.kind === "upload" && replaced.url !== image.url) {
        try {
          await removeObject(replaced.url);
        } catch {
          // Best-effort, as the upload finalize route.
        }
      }
      return apiOk({ avatar });
    }),
  );
}
