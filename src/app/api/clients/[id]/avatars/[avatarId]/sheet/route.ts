import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { removeObject } from "@/lib/storage";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { buildAvatarSheetPrompt } from "@/lib/avatars/generation";
import { generationToImage } from "@/lib/avatars/rows";
import { sheetChangePatch, withStatus } from "@/lib/avatars/utils";
import { AVATAR_SHEET_ASPECT } from "@/lib/avatars/constants";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { preconditionFailed } from "@/lib/avatars/route-responses";

// One image can take over a minute on some models.
export const maxDuration = 300;

const SheetSchema = z.object({ modelId: z.string().min(1) });

// POST …/sheet — generate the profile sheet FROM the front image (D288) and make it current.
// The whole body runs under withTryCatch so a thrown failure from getAvatar/resolveCallerContext
// is formatted rather than crashing; the inner try/catch around runAvatarGeneration still maps
// CreditLimitError to 402 itself — withTryCatch only ever sees a RETURNED response there, never
// a throw, so it never gets a chance to turn that 402 into a 500.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not generate the profile sheet.", async () => {
      const parsed = SheetSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Choose a model.", 400);
      if (!imageGenClientModelMap[parsed.data.modelId]) return apiError("Unknown model.", 400);

      const current = await getAvatar(clientId, avatarId);
      if (!current || current.archivedAt) return apiError("Avatar not found.", 404);
      if (!current.front) return apiError("Add a front image before generating the profile sheet.", 400);
      const frontUrl = current.front.url;

      const caller = await resolveCallerContext();
      try {
        const { generation, creditsCharged } = await runAvatarGeneration({
          clientId,
          avatarId,
          orgId: client.org_id,
          userId: caller.userId,
          userEmail: caller.email,
          slot: "sheet",
          modelId: parsed.data.modelId,
          aspect: AVATAR_SHEET_ASPECT,
          prompt: buildAvatarSheetPrompt(),
          referenceUrls: [frontUrl],
          batchId: null,
        });
        const image = generationToImage(generation);
        if (!image) return apiError("The sheet was generated but could not be read back.", 500);

        // Generation takes a while. If the front was replaced meanwhile, this sheet shows the
        // wrong person: do not attach it. (The credits are spent; the image stays in storage.)
        const latest = await getAvatar(clientId, avatarId);
        if (!latest || latest.archivedAt) return apiError("Avatar not found.", 404);
        if (latest.front?.url !== frontUrl) {
          return apiError("The front image changed while the sheet was generating. Generate it again.", 409);
        }

        // Conditioned on the front this sheet was generated from: the compare above closes most
        // of the window, but the front can still change between that re-read and this write —
        // conditioning the write itself closes the rest of it.
        const avatar = await updateAvatar(
          clientId, avatarId, withStatus(latest, sheetChangePatch(image)), { ifFrontUrl: frontUrl },
        );
        if (!avatar) {
          // `latest`, above, confirms the row existed a moment ago — a null result here means the
          // front precondition caught a (narrower) race, not that the avatar vanished, unless it
          // was archived or deleted in between.
          return preconditionFailed(clientId, avatarId, "The front image changed while the sheet was generating. Generate it again.");
        }

        const replaced = latest.sheet;
        if (replaced?.source.kind === "upload" && replaced.url !== image.url) {
          try {
            await removeObject(replaced.url);
          } catch {
            // Best-effort, as the upload finalize route.
          }
        }
        const spentCredits = await sumAvatarCredits(avatarId);
        return apiOk({ avatar, creditsCharged, spentCredits });
      } catch (e) {
        if (e instanceof CreditLimitError) return apiError(CREDIT_LIMIT_TOAST_MESSAGE, 402);
        return apiError(e instanceof Error ? e.message : "Image generation failed", 500);
      }
    }),
  );
}
