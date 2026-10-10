import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { removeObject } from "@/lib/storage";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { buildAvatarViewPrompt } from "@/lib/avatars/generation";
import { generationToImage } from "@/lib/avatars/rows";
import { composeSheetStrip } from "@/lib/avatars/sheet-compose";
import { sheetViewsPatch, viewsToMake, withStatus } from "@/lib/avatars/utils";
import { AVATAR_VIEWS, AVATAR_VIEW_ASPECT, AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarImage, AvatarViewId } from "@/lib/avatars/schema";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { preconditionFailed } from "@/lib/avatars/route-responses";

// Four images in parallel; one can take over a minute on some models.
export const maxDuration = 300;

const SheetSchema = z.object({
  modelId: z.string().min(1),
  views: z.array(z.enum(AVATAR_VIEWS)).min(1).optional(),
});

const FRONT_CHANGED = "The front image changed while the sheet was generating. Generate it again.";

const failureMessage = (reason: unknown) =>
  reason instanceof CreditLimitError ? CREDIT_LIMIT_TOAST_MESSAGE
    : reason instanceof Error ? reason.message
    : "Image generation failed";

// POST …/sheet — D340: make the sheet's views FROM the front image, one image per view, and
// compose them into the `sheet` strip once all four exist. `views` remakes only those views,
// and only when the sheet is current (viewsToMake). Each view is billed on its own: a view that
// fails is refunded by runAvatarGeneration, the others are kept, and `failed` names the gaps.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not generate the profile sheet.", async () => {
      const raw = await req.json().catch(() => null);
      const parsed = SheetSchema.safeParse(raw);
      if (!parsed.success) {
        return apiError(raw && typeof raw === "object" && "views" in raw ? "Unknown view." : "Choose a model.", 400);
      }
      if (!imageGenClientModelMap[parsed.data.modelId]) return apiError("Unknown model.", 400);

      const current = await getAvatar(clientId, avatarId);
      if (!current || current.archivedAt) return apiError("Avatar not found.", 404);
      if (!current.front) return apiError("Add a front image before generating the profile sheet.", 400);
      const frontUrl = current.front.url;
      const views = viewsToMake(current, parsed.data.views);

      const caller = await resolveCallerContext();
      const results = await Promise.allSettled(
        views.map((view) =>
          runAvatarGeneration({
            clientId, avatarId, orgId: client.org_id, userId: caller.userId, userEmail: caller.email,
            slot: "sheet", view, modelId: parsed.data.modelId, aspect: AVATAR_VIEW_ASPECT,
            prompt: buildAvatarViewPrompt(view), referenceUrls: [frontUrl], batchId: null,
          }),
        ),
      );

      const made: Partial<Record<AvatarViewId, AvatarImage>> = {};
      const failed: { view: AvatarViewId; label: string; error: string }[] = [];
      let creditsCharged = 0;
      results.forEach((result, i) => {
        const view = views[i];
        if (result.status === "fulfilled") creditsCharged += result.value.creditsCharged;
        const image = result.status === "fulfilled" ? generationToImage(result.value.generation) : null;
        if (image) made[view] = image;
        else {
          const error = result.status === "rejected"
            ? failureMessage(result.reason)
            : "The view was generated but could not be read back.";
          failed.push({ view, label: AVATAR_VIEW_LABELS[view], error });
        }
      });
      if (Object.keys(made).length === 0) {
        const capped = results.some((r) => r.status === "rejected" && r.reason instanceof CreditLimitError);
        return apiError(capped ? CREDIT_LIMIT_TOAST_MESSAGE : failed[0].error, capped ? 402 : 500);
      }

      // Generation takes a while. Views of a front that was replaced meanwhile show the wrong
      // person: do not attach them. (The credits are spent; the images stay in storage.)
      const latest = await getAvatar(clientId, avatarId);
      if (!latest || latest.archivedAt) return apiError("Avatar not found.", 404);
      if (latest.front?.url !== frontUrl) return apiError(FRONT_CHANGED, 409);

      const { patch, complete } = sheetViewsPatch(latest, made);
      let sheet: AvatarImage | null = null;
      if (complete) {
        try {
          sheet = await composeSheetStrip({ clientId, avatarId, views: complete });
        } catch (e) {
          // The views are made and paid for; without the strip, video sends the front alone
          // until the sheet is next regenerated. Not worth failing the request over.
          console.warn(`[avatars] could not compose the sheet strip for ${avatarId}:`, e);
        }
      }

      // Conditioned on the front the views were made from (as before D340).
      const avatar = await updateAvatar(
        clientId, avatarId, withStatus(latest, { ...patch, sheet }), { ifFrontUrl: frontUrl },
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
      return apiOk({ avatar, creditsCharged, spentCredits, failed });
    }),
  );
}
