import "server-only";
import { tasks } from "@trigger.dev/sdk/v3";
import { insertGeneration, failGeneration, hasRunningGeneration } from "@/lib/db/generations";
import { insertVersion } from "@/lib/db/versions";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import { uploadImageGenMask, signImageGenResultUploads } from "@/lib/storage";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import type { CallerContext } from "@/lib/dal-logic";
import type { ImageGenerateTaskPayload } from "@/lib/image-gen/task-payload";

export type StartImageGenerationInput = {
  nodeId: string;
  clientId: string;
  orgId: string;
  caller: CallerContext;
  modelId: string;
  params: Record<string, unknown>;
  prompt: string;
  referenceUrls: string[];
  inputsUsed: Record<string, unknown>;
  /** A painted edit region (models with supportsMask). The base image stays clean. */
  mask?: { base64: string; mime: string };
};

/**
 * D366 — the route side of an async image generation, shared by Image Gen and Composite once
 * their prompt and references are decided: refuse a second run, record the run, reserve, upload
 * any mask, sign the result uploads, start `image-generate` and answer 202. The version and the
 * settlement happen when the task reports back (completeGeneration).
 */
export async function startImageGeneration(input: StartImageGenerationInput): Promise<Response> {
  const { nodeId, clientId, orgId, caller, modelId, params, prompt, referenceUrls, inputsUsed, mask } = input;

  if (await hasRunningGeneration(nodeId)) {
    return apiError("This node is already generating.", 409);
  }

  const generation = await insertGeneration({
    nodeId,
    orgId,
    clientId,
    userId: caller.userId,
    userEmail: caller.email,
    type: "image",
    modelUsed: modelId,
    paramsSnapshot: params,
    inputsSnapshot: inputsUsed,
  });

  try {
    const costUsd = estimateImageGenerationCostUsd({
      modelId,
      quality: params.quality as string | undefined,
      aspectRatio: params.aspect_ratio as string | undefined,
      imageSize: params.image_size as string | undefined,
      referenceUrls,
    });
    if (costUsd === null) throw new Error(`No cost estimate available for ${modelId} at this quality/size.`);
    const reservation = await reserveCredits(orgId, generation.id, usdToFinalCredits(costUsd));
    if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");

    const maskUrl = mask
      ? await uploadImageGenMask({ nodeId, generationId: generation.id, base64: mask.base64, mime: mask.mime })
      : undefined;
    const uploads = await signImageGenResultUploads({ nodeId, generationId: generation.id });

    const payload: ImageGenerateTaskPayload = {
      generationId: generation.id,
      modelId,
      prompt,
      referenceUrls,
      params,
      ...(maskUrl ? { maskUrl, maskMime: mask?.mime ?? "image/png" } : {}),
      uploads,
    };
    await tasks.trigger("image-generate", payload);

    return apiOk({ generationId: generation.id }, 202);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Image generation failed";
    // The failed attempt still shows in History, with its maker — as the synchronous path did.
    await insertVersion({
      nodeId,
      operatorUserId: caller.userId,
      inputsUsed,
      paramsUsed: { modelId, ...params },
      modelUsed: modelId,
      error: message,
    }).catch(() => null);
    await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
    await refundReservation({ orgId, generationId: generation.id }).catch(() => null);
    return apiError(message, e instanceof CreditLimitError ? 402 : 500);
  }
}
