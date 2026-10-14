import "server-only";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { getGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { computeVideoCost, isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { settleGeneration, refundReservation } from "@/lib/db/credit-transactions";
import { usdToFinalCredits } from "@/lib/credits/units";
import { uploadVideoGen, isOwnStoredUrl } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { videoDownloadHeaders } from "@/lib/video-gen/download-headers";
import { readVoiceChange } from "@/lib/voice-change/source";
import { isVoicePreviewGeneration } from "@/lib/avatars/voice-preview";
import { completeAvatarVoicePreview } from "@/lib/avatars/complete-voice-preview";
import { computeImageCost } from "@/lib/image-gen/cost";
import { IMAGE_GENERATION_FAILED_MESSAGE, plainImageFailure } from "@/lib/image-gen/failure-copy";
import type { ImageGenerationSucceeded } from "@/lib/image-gen/run-task";
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

  // A provider billed per image (Seedream) reports its exact charge; token-billed ones don't.
  const cost =
    input.costUsd !== undefined
      ? { usd: input.costUsd }
      : input.tokensUsed && generation.model_used
        ? computeImageCost(generation.model_used, input.tokensUsed)
        : null;
  const actualCredits = cost ? usdToFinalCredits(cost.usd) : 0;

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

export type CompleteGenerationInput =
  | {
      generationId: string;
      status: "succeeded";
      kind?: "video";
      videoUrl: string;
      durationSeconds: number;
      /** D282 — `videoUrl` is already in our bucket (the task uploaded it); skip download/upload. */
      stored?: boolean;
      meta?: Record<string, unknown>;
    }
  | ImageGenerationSucceeded
  | {
      generationId: string;
      status: "failed";
      error: string;
    };

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
    await failAndRefund(input.generationId, generation.org_id, input.error);
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
        "Stored video URL is outside this app's bucket",
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
        `Failed to download video from provider: ${videoResponse.status}`,
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
        `Storage upload failed: ${e instanceof Error ? e.message : "unknown"}`,
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

  const cost = voiceChange
    ? computeVoiceChangeCost(input.durationSeconds, voiceChange.priceMultiplier)
    : generation.model_used
      ? computeVideoCost(generation.model_used, input.durationSeconds, audioEnabled, resolution)
      : null;
  // cost is only ever null when model_used is unset (shouldn't happen — every video
  // generation records a model at insertGeneration) — an actual cost of 0 credits in that
  // case, not a reason to skip settlement.
  const actualCredits = cost ? usdToFinalCredits(cost.usd) : 0;

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
    outputSnapshot: storedVideoUrl,
    meta: input.meta,
  });
}
