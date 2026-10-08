import "server-only";
import sharp from "sharp";
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { computeImageCost } from "@/lib/image-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import {
  reserveCredits, settleGeneration, refundReservation, CreditLimitError,
} from "@/lib/db/credit-transactions";
import { uploadAvatarGenerated } from "@/lib/storage";
import { extForContentType } from "@/lib/storage/paths";
import type { GenerationRow } from "@/lib/db/types";
import type { AvatarImageSlot } from "./schema";
import { avatarImageParams, estimateAvatarImageCostUsd } from "./generation";

export type AvatarGenerationArgs = {
  clientId: string;
  avatarId: string;
  orgId: string;
  userId: string;
  userEmail: string | null;
  slot: AvatarImageSlot;
  modelId: string;
  aspect: string;
  prompt: string;
  referenceUrls: string[];
  batchId: string | null;
};

// D291 — one avatar image, billed through the same ledger as every canvas generation:
// reserve the estimate, run the provider, store its bytes untouched, then settle the real
// cost — or fail the generation and refund on any error. The same order and the same
// fail-closed rule (no estimate, no generation) as image-generate/route.ts.
export async function runAvatarGeneration(
  args: AvatarGenerationArgs,
): Promise<{ generation: GenerationRow; creditsCharged: number }> {
  const config = imageGenRegistry[args.modelId];
  const params = avatarImageParams(args.modelId, args.aspect);
  if (!config || !params) throw new Error(`Unknown model: ${args.modelId}`);
  const parsed = config.schema.safeParse(params);
  if (!parsed.success) throw new Error(`Invalid params for ${args.modelId}.`);
  const validatedParams = parsed.data as Record<string, unknown>;

  const inputsSnapshot = {
    slot: args.slot,
    prompt: args.prompt,
    batchId: args.batchId,
    referenceUrls: args.referenceUrls,
  };
  const generation = await insertGeneration({
    avatarId: args.avatarId,
    orgId: args.orgId,
    clientId: args.clientId,
    userId: args.userId,
    userEmail: args.userEmail,
    type: "image",
    modelUsed: args.modelId,
    paramsSnapshot: validatedParams,
    inputsSnapshot,
  });

  try {
    const estimateUsd = estimateAvatarImageCostUsd({
      modelId: args.modelId,
      aspect: args.aspect,
      referenceCount: args.referenceUrls.length,
    });
    if (estimateUsd === null) {
      throw new Error(`No cost estimate available for ${args.modelId}.`);
    }
    const reservation = await reserveCredits(args.orgId, generation.id, usdToFinalCredits(estimateUsd));
    if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");

    const result = await config.generate({
      prompt: args.prompt,
      referenceUrls: args.referenceUrls,
      params: validatedParams,
    });

    // The provider's bytes, as they arrived: no resize, no re-encode.
    const bytes = Buffer.from(result.imageBase64, "base64");
    const { url } = await uploadAvatarGenerated({
      clientId: args.clientId,
      avatarId: args.avatarId,
      slot: args.slot,
      ext: extForContentType(result.mimeType),
      body: bytes,
      contentType: result.mimeType,
    });

    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(bytes).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // best-effort — dimensions are display-only
    }

    // A provider billed per image (Seedream) reports its exact charge; token-billed ones don't.
    const cost =
      result.costUsd !== undefined
        ? { usd: result.costUsd }
        : result.tokensUsed
          ? computeImageCost(args.modelId, result.tokensUsed)
          : null;
    const creditsCharged = cost ? usdToFinalCredits(cost.usd) : 0;
    const meta = {
      ...(args.userEmail ? { email: args.userEmail } : {}),
      width,
      height,
      sizeBytes: bytes.length,
    };

    await settleGeneration({ orgId: args.orgId, generationId: generation.id, actualAmount: creditsCharged });
    await succeedGeneration({
      generationId: generation.id,
      costUsd: cost?.usd,
      creditsCharged,
      tokensUsed: { ...result.tokensUsed },
      outputSnapshot: url,
      meta,
    });

    return {
      creditsCharged,
      generation: {
        ...generation,
        status: "succeeded",
        inputs_snapshot: inputsSnapshot,
        output_snapshot: url,
        cost_usd: cost?.usd ?? null,
        credits_charged: creditsCharged,
        meta,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Image generation failed";
    await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
    await refundReservation({ orgId: args.orgId, generationId: generation.id }).catch(() => null);
    throw e;
  }
}
