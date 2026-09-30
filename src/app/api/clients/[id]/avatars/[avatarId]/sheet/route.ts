import { z } from "zod";
import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { removeObject } from "@/lib/storage";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { buildAvatarSheetPrompt } from "@/lib/avatars/generation";
import { generationToImage } from "@/lib/avatars/rows";
import { sheetChangePatch, withStatus } from "@/lib/avatars/utils";
import { AVATAR_SHEET_ASPECT } from "@/lib/avatars/constants";

// One image can take over a minute on some models.
export const maxDuration = 300;

const SheetSchema = z.object({ modelId: z.string().min(1) });

// POST …/sheet — generate the profile sheet FROM the front image (D288) and make it current.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId, client) => {
    const parsed = SheetSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Choose a model.", 400);

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

      const avatar = await updateAvatar(clientId, avatarId, withStatus(latest, sheetChangePatch(image)));
      if (!avatar) return apiError("Avatar not found.", 404);

      const replaced = latest.sheet;
      if (replaced?.source.kind === "upload" && replaced.url !== image.url) {
        try {
          await removeObject(replaced.url);
        } catch {
          // Best-effort, as the upload finalize route.
        }
      }
      return apiOk({ avatar, creditsCharged });
    } catch (e) {
      if (e instanceof CreditLimitError) return apiError(CREDIT_LIMIT_TOAST_MESSAGE, 402);
      return apiError(e instanceof Error ? e.message : "Image generation failed", 500);
    }
  });
}
