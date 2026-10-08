import "server-only";
import sharp from "sharp";
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { computeImageCost } from "@/lib/image-gen/cost";
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
  const config = imageGenRegistry[args.modelId];
  const params = avatarImageParams(args.modelId, args.aspect);
  if (!config || !params) throw new Error(`Unknown model: ${args.modelId}`);
  const parsed = config.schema.safeParse(params);
  if (!parsed.success) throw new Error(`Invalid params for ${args.modelId}.`);
  const validatedParams = parsed.data as Record<string, unknown>;

  const generation = await insertGeneration({
    ...args.owner,
    orgId: args.orgId,
    clientId: args.clientId,
    userId: args.userId,
    userEmail: args.userEmail,
    type: "image",
    modelUsed: args.modelId,
    paramsSnapshot: validatedParams,
    inputsSnapshot: args.inputsSnapshot,
  });

  try {
    const estimateUsd = estimateAvatarImageCostUsd({
      modelId: args.modelId, aspect: args.aspect, referenceCount: args.referenceUrls.length,
    });
    if (estimateUsd === null) throw new Error(`No cost estimate available for ${args.modelId}.`);
    const reservation = await reserveCredits(args.orgId, generation.id, usdToFinalCredits(estimateUsd));
    if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");

    const result = await config.generate({
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

    const cost =
      result.costUsd !== undefined
        ? { usd: result.costUsd }
        : result.tokensUsed
          ? computeImageCost(args.modelId, result.tokensUsed)
          : null;
    const creditsCharged = cost ? usdToFinalCredits(cost.usd) : 0;
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
