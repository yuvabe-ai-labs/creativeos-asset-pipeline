import "server-only";
import { succeedGeneration, failGeneration } from "@/lib/db/generations";
import { settleGeneration, refundReservation } from "@/lib/db/credit-transactions";
import { getClientById } from "@/lib/db/clients";
import { updateAvatar } from "@/lib/db/avatars";
import { usdToFinalCredits } from "@/lib/credits/units";
import { isOwnStoredUrl } from "@/lib/storage";
import { asResolutionString } from "@/lib/video-gen/cost";
import type { GenerationRow } from "@/lib/db/types";
import type { CompleteGenerationInput } from "@/lib/generations/complete";
import { voicePreviewCostUsd, voicePreviewKeepsSample, voicePreviewRowEngine, voicePreviewRowMode } from "./voice-preview";

/** What the task reports about the voice it extracted (D296). */
type VoiceSampleMeta = { url?: unknown; durationSeconds?: unknown };

function readVoiceSample(meta: Record<string, unknown> | undefined): { url: string; durationSeconds: number } | null {
  const sample = meta?.voiceSample as VoiceSampleMeta | undefined;
  const url = typeof sample?.url === "string" ? sample.url : null;
  const seconds = Number(sample?.durationSeconds);
  if (!url || !isOwnStoredUrl(url) || !Number.isFinite(seconds) || seconds <= 0) return null;
  return { url, durationSeconds: seconds };
}

// D294, D296 — the webhook's end of an avatar's voice preview. Unlike a canvas video there is no
// version to append: the clip is the generation's own output, read back by the Studio. A native
// preview also carries a voice sample, which becomes the avatar's reference audio. A failure of
// any part (the clip, the voice change, the extraction) refunds the whole reservation — the
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

  // The task uploads the clip itself, to a URL the route signed. Anything else is not a preview
  // this app made.
  if (!input.stored || !isOwnStoredUrl(input.videoUrl)) {
    await failAndRefund("Preview clip is outside this app's bucket");
    return;
  }

  const mode = voicePreviewRowMode(generation);
  const multiplier = Number((generation.inputs_snapshot as { priceMultiplier?: unknown } | null)?.priceMultiplier);
  const usd = voicePreviewCostUsd(
    mode,
    voicePreviewRowEngine(generation),
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

  // The voice the clip was generated with, kept as what every later generation sends (§6.7).
  // Written after settlement and best-effort: the clip is generated, stored and paid for by now,
  // so a failed write must not undo any of that. The operator sees a preview with no reference
  // saved and can regenerate — which is recoverable, where a refund of a clip they can play
  // would not be.
  const sample = voicePreviewKeepsSample(mode) ? readVoiceSample(input.meta) : null;
  if (sample && generation.avatar_id) {
    try {
      await updateAvatar(client.id, generation.avatar_id, {
        voiceSample: { ...sample, sourceKey: generation.id },
      });
    } catch (e) {
      console.error("[completeAvatarVoicePreview] could not record the voice reference", {
        generationId: generation.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
