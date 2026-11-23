import "server-only";
import sharp from "sharp";
import { getAiCatalog } from "@/lib/ai-models/catalog";
import { MODEL_UNAVAILABLE_MESSAGE } from "@/lib/ai-models/runnable";
import { imageRun } from "@/lib/image-gen/image-run";
import { priceForNewRun, NO_PRICE_MESSAGE } from "@/lib/ai-models/run-price";
import { imageChargeUsd } from "@/lib/ai-models/image-price";
import { usdToFinalCredits } from "@/lib/credits/units";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import {
  reserveCredits, settleGeneration, refundReservation, CreditLimitError,
} from "@/lib/db/credit-transactions";
import type { GenerationRow } from "@/lib/db/types";
import { avatarImageParams, estimateAvatarImageCostUsd } from "@/lib/avatars/generation";

/** D291, D338 — who a generation belongs to: an avatar (Studio images) or a script (panels). */
export type GenerationOwner = { avatarId: string } | { scriptId: string };

export type BilledImageArgs = {
  owner: GenerationOwner;
  orgId: string;
  clientId: string;
  userId: string;
  userEmail: string | null;
  modelId: string;
  aspect: string;
  prompt: string;
  referenceUrls: string[];
  inputsSnapshot: Record<string, unknown>;
  /** Stores the provider's bytes, as they arrived, wherever the owner keeps its images. */
  store: (bytes: Buffer, mimeType: string) => Promise<{ url: string }>;
};

// D291 — one image, billed through the same ledger as every canvas generation: reserve the
// estimate, run the provider, store its bytes untouched, then settle the real cost — or fail
// the generation and refund on any error. Fail-closed: no estimate, no generation. Shared by
// the Avatar Studio and Visualise's panels, so both bill exactly the same way (D346).
export async function runBilledImageGeneration(
  args: BilledImageArgs,
): Promise<{ generation: GenerationRow; creditsCharged: number }> {
  // D540 — the same check every route makes; an avatar or panel has no node, so hidden is refused.
  const run = imageRun(await getAiCatalog(), args.modelId);
  if (!run.ok) throw new Error(run.message);
  const params = avatarImageParams(args.modelId, args.aspect);
  if (!params) throw new Error(MODEL_UNAVAILABLE_MESSAGE);
  const parsed = run.spec.schema.safeParse(params);
  if (!parsed.success) throw new Error(`Invalid params for ${args.modelId}.`);
  const validatedParams = parsed.data as Record<string, unknown>;

  // D534 — the price row this image is reserved and charged with; no row, no image.
  const price = await priceForNewRun(args.modelId);
  if (!price) throw new Error(NO_PRICE_MESSAGE);

  const generation = await insertGeneration({
    ...args.owner,
    orgId: args.orgId,
    clientId: args.clientId,
    userId: args.userId,
    userEmail: args.userEmail,
    type: "image",
    modelUsed: args.modelId,
    modelPriceId: price.id,
    paramsSnapshot: validatedParams,
    inputsSnapshot: args.inputsSnapshot,
  });

  try {
    const estimateUsd = estimateAvatarImageCostUsd(price, {
      modelId: args.modelId, aspect: args.aspect, referenceCount: args.referenceUrls.length,
    });
    if (estimateUsd === null) throw new Error(`No cost estimate available for ${args.modelId}.`);
    const reservedCredits = usdToFinalCredits(estimateUsd);
    const reservation = await reserveCredits(args.orgId, generation.id, reservedCredits);
    if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");

    const result = await run.generate({
      prompt: args.prompt, referenceUrls: args.referenceUrls, params: validatedParams,
    });

    // The provider's bytes, as they arrived: no resize, no re-encode.
    const bytes = Buffer.from(result.imageBase64, "base64");
    const { url } = await args.store(bytes, result.mimeType);

    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(bytes).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // best-effort — dimensions are display-only
    }

    const charge = imageChargeUsd(price, { tokens: result.tokensUsed ?? null, billedImages: result.billedImages ?? null });
    if (charge && charge.unpriced.length > 0) {
      console.error(
        `[billedImageRun] image ${generation.id} (${args.modelId}) has meters with no price: ${charge.unpriced.join(", ")}`,
      );
    }
    // Partial pricing: the provider billed something but nothing priced, so charge the reservation, never 0.
    const nothingPriced =
      !!charge && charge.unpriced.length > 0 && charge.usd === 0 && Object.values(charge.meters).some((q) => (q ?? 0) > 0);
    const cost = charge && !nothingPriced ? { usd: charge.usd } : null;
    const creditsCharged = cost ? usdToFinalCredits(cost.usd) : nothingPriced ? reservedCredits : 0;
    const meta = { ...(args.userEmail ? { email: args.userEmail } : {}), width, height, sizeBytes: bytes.length };

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
        inputs_snapshot: args.inputsSnapshot,
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
