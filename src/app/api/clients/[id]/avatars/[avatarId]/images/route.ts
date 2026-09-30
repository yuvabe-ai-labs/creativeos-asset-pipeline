import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { publicUrlFor, removeObject } from "@/lib/storage";
import { frontChangePatch, sheetChangePatch, withStatus } from "@/lib/avatars/utils";
import { AVATAR_STORED_NAME_RE } from "@/lib/avatars/constants";
import { preconditionFailed } from "@/lib/avatars/route-responses";
import type { AvatarImage } from "@/lib/avatars/schema";

const FinalizeSchema = z.object({
  path: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().nonnegative(),
  slot: z.enum(["front", "sheet"]),
  imageWidth: z.number().positive().optional(),
  imageHeight: z.number().positive().optional(),
});

// POST /api/clients/:id/avatars/:avatarId/images — record an image the browser has already
// uploaded. Takes the storage PATH, never a URL, and checks it sits in this avatar's own slot
// folder: a caller-supplied URL would let one client record, and later delete, another
// client's object (the same guard as brand-kit/assets).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not save the image.", async () => {
      const parsed = FinalizeSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const { path, filename, size, slot, imageWidth, imageHeight } = parsed.data;

      // The avatar's own slot folder, then ONE stored name from an allow-list. A prefix check
      // alone can be satisfied by ".../front/../../a9/front/x", and rejecting "/" and ".."
      // still lets backslashes and "%2e%2e" through — URL parsers resolve both, so the stored
      // URL would load another avatar's (or another client's) object.
      const expectedPrefix = `clients/${clientId}/avatars/${avatarId}/${slot}/`;
      const name = path.startsWith(expectedPrefix) ? path.slice(expectedPrefix.length) : null;
      if (name === null || !AVATAR_STORED_NAME_RE.test(name)) {
        return apiError("Upload path does not belong to this avatar.", 400);
      }

      const current = await getAvatar(clientId, avatarId);
      if (!current || current.archivedAt) return apiError("Avatar not found.", 404);

      const caller = await resolveCallerContext();
      const image: AvatarImage = {
        url: publicUrlFor(path),
        width: imageWidth ?? null,
        height: imageHeight ?? null,
        sizeBytes: size,
        source: {
          kind: "upload",
          filename,
          uploadedBy: caller.userId,
          uploadedAt: new Date().toISOString(),
        },
      };

      // Conditioned on the front that was read, like the pick and sheet routes: a front upload
      // replaces the face that was on screen, and a sheet upload attaches to it.
      const change = slot === "front" ? frontChangePatch(current, image) : sheetChangePatch(image);
      const avatar = await updateAvatar(clientId, avatarId, withStatus(current, change), {
        ifFrontUrl: current.front?.url ?? null,
      });
      if (!avatar) {
        return preconditionFailed(clientId, avatarId, "The front image changed. Upload again.");
      }

      // Only an UPLOAD is removed when replaced, and only when it is a genuinely different
      // object: finalizing the same upload twice (a retry, a double submit) would otherwise
      // delete the object the row now points at.
      const replaced = current[slot];
      if (replaced?.source.kind === "upload" && replaced.url !== image.url) {
        try {
          await removeObject(replaced.url);
        } catch {
          // Best-effort, as deleteBrandAsset: an orphaned blob beats a failed save.
        }
      }
      return apiOk({ avatar });
    }),
  );
}
