import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { removeObject } from "@/lib/storage";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { generationToImage } from "@/lib/avatars/rows";
import { cutSheetIntoViews } from "@/lib/avatars/sheet-cut";
import { withStatus } from "@/lib/avatars/utils";
import { AVATAR_SHEET_ASPECT, AVATAR_VIEWS, AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarImage, AvatarViewId } from "@/lib/avatars/schema";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { preconditionFailed } from "@/lib/avatars/route-responses";
import { buildAvatarSheetPrompt } from "@/prompts/avatar-character";

// One image can take over a minute on some models.
export const maxDuration = 300;

// A `views` list from an older client is ignored (zod drops unknown keys): the sheet is one
// image, so its views are always made together.
const SheetSchema = z.object({ modelId: z.string().min(1) });

const FRONT_CHANGED = "The front image changed while the sheet was generating. Generate it again.";
const CUT_FAILED = "The sheet was made but could not be split into views. Generate it again.";

// POST …/sheet — D395: ONE turnaround sheet made FROM the front image, then cut into the four
// views panels and review use (D340's shape). One render keeps the face, outfit and scale the
// same in every view. One image is billed; a failure is refunded by runAvatarGeneration.
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
      let made: Awaited<ReturnType<typeof runAvatarGeneration>>;
      try {
        made = await runAvatarGeneration({
          clientId, avatarId, orgId: client.org_id, userId: caller.userId, userEmail: caller.email,
          slot: "sheet", modelId: parsed.data.modelId, aspect: AVATAR_SHEET_ASPECT,
          prompt: buildAvatarSheetPrompt(), referenceUrls: [frontUrl], batchId: null,
        });
      } catch (e) {
        if (e instanceof CreditLimitError) return apiError(CREDIT_LIMIT_TOAST_MESSAGE, 402);
        return apiError(e instanceof Error ? e.message : "Image generation failed", 500);
      }
      const sheet = generationToImage(made.generation);
      if (!sheet) return apiError("The sheet was generated but could not be read back.", 500);

      // Generation takes a while. A sheet of a front that was replaced meanwhile shows the wrong
      // person: do not attach it. (The credits are spent; the image stays in storage.)
      const latest = await getAvatar(clientId, avatarId);
      if (!latest || latest.archivedAt) return apiError("Avatar not found.", 404);
      if (latest.front?.url !== frontUrl) return apiError(FRONT_CHANGED, 409);

      let views: Record<AvatarViewId, AvatarImage> | null = null;
      try {
        views = await cutSheetIntoViews({ clientId, avatarId, sheet });
      } catch (e) {
        // The sheet is paid for and still works as video's reference (D308); without views the
        // avatar stays a draft until the sheet is made again.
        console.warn(`[avatars] could not cut the sheet into views for ${avatarId}:`, e);
      }
      const failed = views ? [] : AVATAR_VIEWS.map((view) => ({ view, label: AVATAR_VIEW_LABELS[view], error: CUT_FAILED }));

      // Conditioned on the front the sheet was made from.
      const avatar = await updateAvatar(
        clientId, avatarId, withStatus(latest, { sheet, sheetViews: views, sheetStale: false }), { ifFrontUrl: frontUrl },
      );
      if (!avatar) return preconditionFailed(clientId, avatarId, FRONT_CHANGED);

      const replaced = latest.sheet;
      if (replaced?.source.kind === "upload") {
        try {
          await removeObject(replaced.url);
        } catch {
          // Best-effort, as the upload finalize route.
        }
      }
      const spentCredits = await sumAvatarCredits(avatarId).catch(() => null);
      return apiOk({ avatar, creditsCharged: made.creditsCharged, spentCredits, failed });
    }),
  );
}
