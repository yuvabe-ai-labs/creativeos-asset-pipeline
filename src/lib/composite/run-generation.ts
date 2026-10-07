import "server-only";
import sharp from "sharp";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { computeImageCost } from "@/lib/image-gen/cost";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { validateReferenceImages, type RefImageMeta } from "@/lib/image-gen/validate";
import { mimeToExt } from "@/lib/image-gen/utils";
import type { MediaGenModelSpec } from "@/lib/image-gen/types";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  reserveCredits,
  settleGeneration,
  refundReservation,
  CreditLimitError,
} from "@/lib/db/credit-transactions";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { uploadImageGen } from "@/lib/storage";
import type { CallerContext } from "@/lib/dal-logic";

// D312 — one composite generation, once the prompt and images are decided: the image-generate
// pipeline (generation → reserve → provider → upload → version → settle; record-fail-refund on
// error). Shared by Generate and Edit so a credit-path fix lands once.

/** Why these images cannot be sent, or null. Never slices: every later "image N" the
 *  instruction resolved to would point at the wrong one. */
export function referenceProblem(
  images: RefImageMeta[],
  config: MediaGenModelSpec,
): { message: string; status: number } | null {
  if (images.length > config.maxReferenceImages) {
    return {
      message: `${images.length} reference images are connected — ${config.label} takes ${config.maxReferenceImages}. Disconnect some before generating.`,
      status: 422,
    };
  }
  const validation = validateReferenceImages(images, config);
  if (validation.ok) return null;
  const count = validation.violations.length;
  return {
    message:
      count === 1
        ? `One of your reference images can't be used: ${validation.violations[0].message}`
        : `${count} reference images can't be used — resize them before generating.`,
    status: 422,
  };
}

export type CompositeRun = {
  nodeId: string;
  clientId: string;
  orgId: string;
  caller: CallerContext;
  modelId: string;
  config: MediaGenModelSpec;
  params: Record<string, unknown>;
  prompt: string;
  referenceUrls: string[];
  inputsUsed: Record<string, unknown>;
};

export async function runCompositeGeneration(run: CompositeRun) {
  const { nodeId, clientId, orgId, caller, modelId, config, params, prompt, referenceUrls, inputsUsed } = run;
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

    const result = await config.generate({ prompt, referenceUrls, params });

    const buffer = Buffer.from(result.imageBase64, "base64");
    const { url: imageUrl } = await uploadImageGen({
      nodeId,
      ext: mimeToExt(result.mimeType),
      body: buffer,
      contentType: result.mimeType,
    });
    let width: number | undefined;
    let height: number | undefined;
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width;
      height = meta.height;
    } catch {
      // best-effort
    }

    const version = await insertVersion({
      nodeId,
      operatorUserId: caller.userId,
      inputsUsed,
      paramsUsed: {
        modelId,
        ...params,
        tokensUsed: result.tokensUsed,
        imageWidth: width,
        imageHeight: height,
        fileSizeBytes: buffer.length,
      },
      modelUsed: modelId,
      output: imageUrl,
    });
    await setActiveVersion(nodeId, version.id);

    // Seedream reports its exact per-image charge; token-billed providers don't.
    const cost =
      result.costUsd !== undefined
        ? { usd: result.costUsd }
        : result.tokensUsed
          ? computeImageCost(modelId, result.tokensUsed)
          : null;
    const actualCredits = cost ? usdToFinalCredits(cost.usd) : 0;
    await settleGeneration({ orgId, generationId: generation.id, actualAmount: actualCredits });
    await succeedGeneration({
      generationId: generation.id,
      versionId: version.id,
      costUsd: cost?.usd,
      creditsCharged: actualCredits,
      tokensUsed: { ...result.tokensUsed },
      outputSnapshot: imageUrl,
    });

    return apiOk({ imageUrl, versionId: version.id, fileSizeBytes: buffer.length, imageWidth: width, imageHeight: height });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Composite generation failed";
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
