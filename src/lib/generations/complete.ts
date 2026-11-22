import "server-only";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { getGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
import { readVideoUsage, type VideoProviderUsage } from "@/lib/video-gen/provider-usage";
import { priceForGeneration } from "@/lib/ai-models/run-price";
import { videoChargeUsd } from "@/lib/ai-models/video-price";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { settleGeneration, refundReservation, getReservationAmounts } from "@/lib/db/credit-transactions";
import { usdToFinalCredits } from "@/lib/credits/units";
import { uploadVideoGen, isOwnStoredUrl } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { videoDownloadHeaders } from "@/lib/video-gen/download-headers";
import { readVideoEdit, plainVideoEditFailure } from "@/lib/video-edit/record";
import { readVoiceChange } from "@/lib/voice-change/source";
import { isVoicePreviewGeneration } from "@/lib/avatars/voice-preview";
import { completeAvatarVoicePreview } from "@/lib/avatars/complete-voice-preview";
import { imageChargeUsd } from "@/lib/ai-models/image-price";
import { IMAGE_GENERATION_FAILED_MESSAGE, plainImageFailure } from "@/lib/image-gen/failure-copy";
import type { ImageGenerationSucceeded } from "@/lib/image-gen/run-task";
import { completeDubGeneration, completeLipSyncGeneration, dubbingCompleteDeps, type DubSucceeded, type LipSyncSucceeded } from "@/lib/dubbing/complete";
import type { GenerationRow } from "@/lib/db/types";

// Every failure path in this file needs the same two calls in the same order — a small
// local helper keeps that from drifting out of sync across the 3 sites that need it.
async function failAndRefund(
  generationId: string,
  orgId: string,
  error: string,
): Promise<void> {
  await failGeneration({ generationId, error });
  await refundReservation({ orgId, generationId });
}

// D483 — a failed video edit shows plain words; the raw reason (a vendor message, a URL) stays in the log.
function videoFailureText(generation: GenerationRow, generationId: string, raw: string): string {
  if (!readVideoEdit(generation.inputs_snapshot?.videoEdit)) return raw;
  console.error("[completeGeneration] video edit failed", { generationId, error: raw });
  return plainVideoEditFailure(raw);
}

// D534 — a finished paid run is never charged 0 because its price is missing: the provider has
// billed us and the output is kept, so settle at what was reserved and record no dollar cost.
export async function reservedAmountForUnpriced(
  generationId: string,
  generation: GenerationRow,
  kind: "image" | "video",
): Promise<number> {
  console.error(`[completeGeneration] no price for a finished ${kind}; settled at the reserved amount`, {
    generationId,
    model: generation.model_used,
  });
  // No reservation row means nothing was reserved, so nothing is owed.
  return (await getReservationAmounts([generationId])).get(generationId) ?? 0;
}

// D366 — an image arrives already stored (the task uploaded it through a signed URL).
async function completeImageGeneration(
  nodeId: string,
  generation: GenerationRow,
  input: ImageGenerationSucceeded,
): Promise<void> {
  if (!isOwnStoredUrl(input.imageUrl)) {
    console.error("[completeGeneration] image stored outside this app's bucket", {
      generationId: input.generationId,
      imageUrl: input.imageUrl,
    });
    await failAndRefund(input.generationId, generation.org_id, IMAGE_GENERATION_FAILED_MESSAGE);
    return;
  }

  const version = await insertVersion({
    nodeId,
    operatorUserId: generation.user_id,
    inputsUsed: generation.inputs_snapshot ?? {},
    paramsUsed: {
      modelId: generation.model_used,
      ...(generation.params_snapshot ?? {}),
      tokensUsed: input.tokensUsed ?? null,
      imageWidth: input.width,
      imageHeight: input.height,
      fileSizeBytes: input.fileSizeBytes,
    },
    modelUsed: generation.model_used,
    output: input.imageUrl,
  });

  // D534 — priced with the row this run was reserved with: billed images (Seedream) or tokens.
  const price = await priceForGeneration(generation);
  const charge = price
    ? imageChargeUsd(price, { tokens: input.tokensUsed ?? null, billedImages: input.billedImages ?? null })
    : null;
  if (charge && charge.unpriced.length > 0) {
    console.error(
      `[completeGeneration] image ${input.generationId} (${generation.model_used}) has meters with no price: ${charge.unpriced.join(", ")}`,
    );
  }
  // Partial pricing: the provider billed something but nothing priced, so charge the reservation, never 0.
  const nothingPriced =
    !!charge && charge.unpriced.length > 0 && charge.usd === 0 && Object.values(charge.meters).some((q) => (q ?? 0) > 0);
  const cost = charge && !nothingPriced ? { usd: charge.usd } : null;
  // A paid image with a missing price settles at what was reserved. A provider that reported
  // neither tokens nor billed images still settles at 0 (unchanged).
  const actualCredits = cost
    ? usdToFinalCredits(cost.usd)
    : price && !nothingPriced
      ? 0
      : await reservedAmountForUnpriced(input.generationId, generation, "image");

  // Settle before the image goes live: if settling throws, the row is still `running` and no
  // card shows an image the run never paid for.
  await settleGeneration({ orgId: generation.org_id, generationId: input.generationId, actualAmount: actualCredits });
  await setActiveVersion(nodeId, version.id);
  await succeedGeneration({
    generationId: input.generationId,
    versionId: version.id,
    costUsd: cost?.usd,
    creditsCharged: actualCredits,
    tokensUsed: input.tokensUsed ? { ...input.tokensUsed } : null,
    outputSnapshot: input.imageUrl,
  });
}

export type VideoGenerationSucceeded = {
  generationId: string;
  status: "succeeded";
  kind?: "video";
  videoUrl: string;
  durationSeconds: number;
  /** D282 — `videoUrl` is already in our bucket (the task uploaded it); skip download/upload. */
  stored?: boolean;
  meta?: Record<string, unknown>;
  /** D528 — the provider's own usage; read through readVideoUsage, never trusted as typed. */
  usage?: VideoProviderUsage;
};

export type CompleteGenerationInput =
  | VideoGenerationSucceeded
  | ImageGenerationSucceeded
  | DubSucceeded
  | LipSyncSucceeded
  | {
      generationId: string;
      status: "failed";
      error: string;
    };

/** A succeeded plain video (Video Gen / voice preview): not an image, dub or lip sync. */
export function isVideoSucceeded(input: CompleteGenerationInput): input is VideoGenerationSucceeded {
  return input.status === "succeeded" && (input.kind === undefined || input.kind === "video");
}

export async function completeGeneration(
  input: CompleteGenerationInput,
): Promise<void> {
  const generation = await getGeneration(input.generationId);

  // Idempotency: skip if already resolved (duplicate webhook delivery)
  if (generation.status !== "running") {
    // D366 — a paid image for a run that already ended (swept, or failed at the start) is stored
    // but attached to nothing. Name it so it can be attached by hand (a true duplicate is quiet).
    if (input.status === "succeeded" && input.kind === "image" && generation.output_snapshot !== input.imageUrl) {
      console.error("[completeGeneration] image arrived for a run that already ended", {
        generationId: input.generationId,
        status: generation.status,
        imageUrl: input.imageUrl,
      });
    }
    return;
  }

  // An avatar-owned row (node_id null) has no node to attach a version to. The one kind that
  // completes through this webhook is the avatar's voice preview (D294), which has its own
  // settlement. The Studio's images (D291) finish inside their own request and never arrive
  // here, so anything else is dropped the same defensive way as the org-mismatch backstop below.
  if (!generation.node_id) {
    if (isVoicePreviewGeneration(generation)) {
      await completeAvatarVoicePreview(generation, input);
      return;
    }
    console.error("[completeGeneration] generation has no node_id — dropping", {
      generationId: input.generationId,
    });
    await failAndRefund(
      input.generationId,
      generation.org_id,
      "Dropped: generation has no node to attach output to",
    ).catch((e) => {
      console.error("[completeGeneration] failAndRefund failed on missing-node path", { error: e });
    });
    return;
  }
  const nodeId = generation.node_id;

  // D79: the org recorded on the job at creation must still match the current org of
  // the node it targets. Should be impossible in practice (nothing in this app moves a
  // client between orgs) — this is a backstop against exactly the class of bug this
  // rollout already found three times, not a response to a real observed drift.
  const { data: currentChain, error: chainError } = await createServerSupabase()
    .from("nodes")
    .select("canvases!inner(clients!inner(org_id))")
    .eq("id", nodeId)
    .maybeSingle();
  if (chainError) throw chainError;
  const canvas = currentChain
    ? Array.isArray(currentChain.canvases) ? currentChain.canvases[0] : currentChain.canvases
    : null;
  const client = canvas
    ? Array.isArray(canvas.clients) ? canvas.clients[0] : canvas.clients
    : null;
  if (!client || client.org_id !== generation.org_id) {
    console.error("[completeGeneration] org mismatch — dropping", {
      generationId: input.generationId,
      recordedOrgId: generation.org_id,
      currentOrgId: client?.org_id ?? null,
    });
    // D79: this path is a defensive backstop for a case framed as "should be impossible in
    // practice" — its non-throwing, best-effort shape is intentional, so failures here are
    // swallowed rather than propagated. Failing (not just logging) also matters now: it
    // makes this generation terminal immediately, so 3D's future reconciliation sweep
    // (which only ever matches status = 'running') will never also try to refund it —
    // exactly once, from exactly one path.
    await failAndRefund(
      input.generationId,
      generation.org_id,
      "Dropped: org no longer matches the node's current client",
    ).catch((e) => {
      console.error("[completeGeneration] failAndRefund failed on org-mismatch path", { error: e });
    });
    return;
  }

  if (input.status === "failed") {
    // D366 — a failed image still shows in History with its maker, as the synchronous path did.
    // Users see plain words; the task's raw reason (a vendor message, or a paid image's URL) is
    // kept in the server log only.
    if (generation.type === "image") {
      console.error("[completeGeneration] image generation failed", {
        generationId: input.generationId,
        error: input.error,
      });
      const userError = plainImageFailure(input.error);
      await insertVersion({
        nodeId,
        operatorUserId: generation.user_id,
        inputsUsed: generation.inputs_snapshot ?? {},
        paramsUsed: { modelId: generation.model_used, ...(generation.params_snapshot ?? {}) },
        modelUsed: generation.model_used,
        error: userError,
      }).catch(() => null);
      await failAndRefund(input.generationId, generation.org_id, userError);
      return;
    }
    await failAndRefund(input.generationId, generation.org_id, videoFailureText(generation, input.generationId, input.error));
    return;
  }

  // D375 - the Dubbing node's two jobs. Fail closed on a kind that doesn't match its row.
  if (input.kind === "dub" || input.kind === "lipsync") {
    if (generation.type !== input.kind) {
      await failAndRefund(input.generationId, generation.org_id, `${input.kind} result for a ${generation.type} generation`);
      return;
    }
    const deps = dubbingCompleteDeps(failAndRefund);
    if (input.kind === "dub") await completeDubGeneration(nodeId, generation, input, deps);
    else await completeLipSyncGeneration(nodeId, generation, input, deps);
    return;
  }

  if (input.kind === "image") {
    // Fail closed: an image result must never settle (or attach a version to) a non-image row.
    if (generation.type !== "image") {
      await failAndRefund(input.generationId, generation.org_id, "Image result for a non-image generation");
      return;
    }
    await completeImageGeneration(nodeId, generation, input);
    return;
  }

  // 1. Get the video into our bucket. D282: a voice-changed generation arrives already stored.
  let storedVideoUrl: string;
  if (input.stored) {
    if (!isOwnStoredUrl(input.videoUrl)) {
      await failAndRefund(
        input.generationId,
        generation.org_id,
        videoFailureText(generation, input.generationId, "Stored video URL is outside this app's bucket"),
      );
      return;
    }
    storedVideoUrl = input.videoUrl;
  } else {
    const videoResponse = await fetch(input.videoUrl, {
      headers: videoDownloadHeaders(generation.model_used),
    });
    if (!videoResponse.ok) {
      await failAndRefund(
        input.generationId,
        generation.org_id,
        videoFailureText(generation, input.generationId, `Failed to download video from provider: ${videoResponse.status}`),
      );
      return;
    }
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    try {
      const result = await uploadVideoGen({
        nodeId,
        body: videoBuffer,
        contentType: "video/mp4",
      });
      storedVideoUrl = result.url;
    } catch (e) {
      await failAndRefund(
        input.generationId,
        generation.org_id,
        videoFailureText(generation, input.generationId, `Storage upload failed: ${e instanceof Error ? e.message : "unknown"}`),
      );
      return;
    }
  }

  // D284 — a voice change appends a version: the root's model/params/inputs + the voice record.
  const voiceChange = generation.type === "voice" ? readVoiceChange(generation.inputs_snapshot?.voiceChange) : null;
  if (generation.type === "voice" && !voiceChange) {
    await failAndRefund(input.generationId, generation.org_id, "Voice change record is missing");
    return;
  }
  const driftMs = (input.meta?.voiceChange as { driftMs?: unknown } | undefined)?.driftMs;

  // 2. INSERT node_versions
  const version = await insertVersion({
    nodeId,
    // R11.1. There is no session at this boundary — this runs from the Trigger.dev
    // webhook, so resolveCallerContext() has nothing to resolve. generations.user_id is
    // who kicked the job off, captured at insertGeneration and (per db/generations.ts)
    // the REAL operator even while impersonating — exactly the maker we want.
    operatorUserId: generation.user_id,
    inputsUsed: voiceChange
      ? { ...(generation.inputs_snapshot ?? {}), voiceChange: { ...voiceChange, ...(typeof driftMs === "number" ? { driftMs } : {}) } }
      : generation.inputs_snapshot ?? {},
    paramsUsed: {
      ...(generation.params_snapshot ?? {}),
      durationSeconds: input.durationSeconds,
    },
    modelUsed: generation.model_used,
    output: storedVideoUrl,
  });

  // 3. Move active pointer
  await setActiveVersion(nodeId, version.id);

  // 4. Compute cost and mark succeeded
  const audioEnabled = isVideoAudioEnabled(generation.params_snapshot?.audio);
  const resolution = asResolutionString(generation.params_snapshot?.resolution);

  // D528/D534 — the provider's reported usage when it sent one, else the seconds, both priced
  // with the row this run was reserved with. A voice change is ElevenLabs' work, priced by its voice.
  const usage = voiceChange ? null : readVideoUsage(input.usage);
  const price = voiceChange ? null : await priceForGeneration(generation);
  const charge = price
    ? videoChargeUsd(price, { usage, durationSeconds: input.durationSeconds, audioEnabled, resolution })
    : null;
  const cost = voiceChange
    ? computeVoiceChangeCost(input.durationSeconds, voiceChange.priceMultiplier)
    : charge
      ? { usd: charge.usd }
      : null;
  // D534 — a finished video is never charged 0 because its price is missing: the provider has
  // billed us and the video is kept, so settle at what was reserved and record no dollar cost.
  const actualCredits = cost
    ? usdToFinalCredits(cost.usd)
    : await reservedAmountForUnpriced(input.generationId, generation, "video");

  await settleGeneration({
    orgId: generation.org_id,
    generationId: input.generationId,
    actualAmount: actualCredits,
  });
  await succeedGeneration({
    generationId: input.generationId,
    versionId: version.id,
    costUsd: cost?.usd,
    creditsCharged: actualCredits,
    ...(charge?.source === "provider_usage" && usage ? { tokensUsed: usage } : {}),
    outputSnapshot: storedVideoUrl,
    meta: input.meta,
  });
}
