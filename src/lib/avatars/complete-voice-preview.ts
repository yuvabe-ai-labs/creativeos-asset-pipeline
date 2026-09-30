import "server-only";
import { succeedGeneration, failGeneration } from "@/lib/db/generations";
import { settleGeneration, refundReservation } from "@/lib/db/credit-transactions";
import { getClientById } from "@/lib/db/clients";
import { usdToFinalCredits } from "@/lib/credits/units";
import { isOwnStoredUrl } from "@/lib/storage";
import { asResolutionString } from "@/lib/video-gen/cost";
import type { GenerationRow } from "@/lib/db/types";
import type { CompleteGenerationInput } from "@/lib/generations/complete";
import { voicePreviewCostUsd } from "./voice-preview";

// D294 — the webhook's end of an avatar's voice preview. Unlike a canvas video there is no
// version to append: the clip is the generation's own output, read back by the Studio. A failure
// of either half (the Omni clip or the voice change) refunds the whole reservation — the
// operator pays only for a preview they can play.
export async function completeAvatarVoicePreview(
  generation: GenerationRow,
  input: CompleteGenerationInput,
): Promise<void> {
  const failAndRefund = async (error: string) => {
    await failGeneration({ generationId: generation.id, error });
    await refundReservation({ orgId: generation.org_id, generationId: generation.id });
  };

  // D79's backstop, for a row with no node: the org that reserved the credits must still own
  // the client the avatar belongs to.
  const client = generation.client_id ? await getClientById(generation.client_id) : null;
  if (!client || client.org_id !== generation.org_id) {
    console.error("[completeAvatarVoicePreview] org mismatch — dropping", { generationId: generation.id });
    await failAndRefund("Dropped: org no longer matches the avatar's client").catch((e) => {
      console.error("[completeAvatarVoicePreview] failAndRefund failed on org-mismatch path", { error: e });
    });
    return;
  }

  if (input.status === "failed") {
    await failAndRefund(input.error);
    return;
  }

  // The task uploads the re-voiced clip itself, to a URL the route signed. Anything else is
  // not a preview this app made.
  if (!input.stored || !isOwnStoredUrl(input.videoUrl)) {
    await failAndRefund("Preview clip is outside this app's bucket");
    return;
  }

  const multiplier = Number((generation.inputs_snapshot as { priceMultiplier?: unknown } | null)?.priceMultiplier);
  const usd = voicePreviewCostUsd(
    input.durationSeconds,
    asResolutionString(generation.params_snapshot?.resolution),
    Number.isFinite(multiplier) && multiplier >= 1 ? multiplier : 1,
  );
  const credits = usd === null ? 0 : usdToFinalCredits(usd);

  await settleGeneration({ orgId: generation.org_id, generationId: generation.id, actualAmount: credits });
  await succeedGeneration({
    generationId: generation.id,
    costUsd: usd ?? undefined,
    creditsCharged: credits,
    outputSnapshot: input.videoUrl,
    meta: input.meta,
  });
}
