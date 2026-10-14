import "server-only";
import type { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { insertGeneration, failGeneration, hasRunningGeneration } from "@/lib/db/generations";
import { insertVersion } from "@/lib/db/versions";
import { reserveCredits, refundReservation, CreditLimitError } from "@/lib/db/credit-transactions";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import { prepareImageGenUploads } from "@/lib/storage";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import type { CallerContext } from "@/lib/dal-logic";
import { IMAGE_GEN_MASK_MIME, type ImageGenerateTaskPayload } from "@/lib/image-gen/task-payload";
import { CREDIT_LIMIT_MESSAGE, START_FAILED_MESSAGE } from "@/lib/image-gen/failure-copy";
import { IMAGE_RUN_QUEUE_TTL } from "@/lib/image-gen/constants";

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
export async function startImageGeneration(input: StartImageGenerationInput): Promise<NextResponse> {
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
    // Independent, so in parallel (AGENTS.md rule 5). Nothing is started until both succeed; a
    // failure of either lands in the catch, which refunds.
    const [reservation, { uploads, maskUrl }] = await Promise.all([
      reserveCredits(orgId, generation.id, usdToFinalCredits(costUsd)),
      prepareImageGenUploads({ nodeId, generationId: generation.id, mask }),
    ]);
    if (!reservation.ok) throw new CreditLimitError(CREDIT_LIMIT_MESSAGE);

    const payload: ImageGenerateTaskPayload = {
      generationId: generation.id,
      modelId,
      prompt,
      referenceUrls,
      params,
      ...(maskUrl ? { maskUrl, maskMime: IMAGE_GEN_MASK_MIME } : {}),
      uploads,
    };
    // A run still queued after the TTL expires instead of starting: it can never begin after the
    // node's running row has aged out (IMAGE_RUN_MAX_AGE_MS) and deliver a result nobody attaches.
    await tasks.trigger("image-generate", payload, { ttl: IMAGE_RUN_QUEUE_TTL });

    return apiOk({ generationId: generation.id }, 202);
  } catch (e) {
    const isCreditLimit = e instanceof CreditLimitError;
    const reason = e instanceof Error ? e.message : String(e);
    console.error("[startImageGeneration] start failed", { generationId: generation.id, error: reason });
    // Users see plain copy, and the row carries the same words: the canvas feed recognises them
    // and leaves the toast to this request (one toast, not two). The raw reason is in the log.
    const userMessage = isCreditLimit ? CREDIT_LIMIT_MESSAGE : START_FAILED_MESSAGE;
    // Close the run first: a row left `running` would refuse this node's next start until it ages
    // out (hasRunningGeneration), so a failure here is logged, never hidden.
    await failGeneration({ generationId: generation.id, error: userMessage }).catch((err: unknown) => {
      console.error("[startImageGeneration] could not close the failed run", {
        generationId: generation.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    // The failed attempt still shows in History, with its maker, as the synchronous path did.
    await insertVersion({
      nodeId,
      operatorUserId: caller.userId,
      inputsUsed,
      paramsUsed: { modelId, ...params },
      modelUsed: modelId,
      error: userMessage,
    }).catch(() => null);
    await refundReservation({ orgId, generationId: generation.id }).catch((err: unknown) => {
      console.error("[startImageGeneration] refund failed", {
        generationId: generation.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return apiError(userMessage, isCreditLimit ? 402 : 500);
  }
}
