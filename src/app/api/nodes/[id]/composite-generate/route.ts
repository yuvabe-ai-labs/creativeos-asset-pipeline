import sharp from "sharp";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { computeImageCost } from "@/lib/image-gen/cost";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { validateReferenceImages } from "@/lib/image-gen/validate";
import { mimeToExt } from "@/lib/image-gen/utils";
import { usdToFinalCredits } from "@/lib/credits/units";
import {
  reserveCredits,
  settleGeneration,
  refundReservation,
  CreditLimitError,
} from "@/lib/db/credit-transactions";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { uploadImageGen } from "@/lib/storage";
import { loadCompositeInputs } from "@/lib/composite/load-inputs";
import {
  referenceImagesOf,
  resolveCompositeMentions,
  danglingMentions,
  danglingMentionMessage,
} from "@/lib/composite/references";
import { compositeModelLock, resolveCompositeModelId } from "@/lib/composite/model";
import { buildCompositePrompt, COMPOSITE_PROMPT_ID } from "@/prompts/composite-generate";

// D309 — the Composite node's generation. image-generate/route.ts is the template, not the
// route: the pipeline (validate → generation → reserve → provider → upload → version → settle,
// and record-fail-refund on error) is the same; the prompt comes from the node's own instruction
// and the reference roster instead of a connected Prompt node. Every operator error is refused
// BEFORE insertGeneration, so nothing is reserved for a request that could never run.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, async (nodeId, node, caller, clientId, effectiveOrgId) => {
    const body = (await req.json().catch(() => null)) as
      | { instruction?: unknown; modelId?: unknown; params?: unknown }
      | null;

    // The body wins: the canvas autosaves on a delay, so the stored instruction can lag what the
    // operator just typed and clicked Generate on.
    const stored = (node.data as Record<string, unknown> | null)?.instruction;
    const rawInstruction =
      typeof body?.instruction === "string" ? body.instruction : typeof stored === "string" ? stored : "";
    if (!rawInstruction.trim()) return apiError("Say what to make — the instruction is empty.", 400);

    const inputs = await loadCompositeInputs(nodeId, clientId);
    if (!inputs.ok) return apiError(inputs.error, 400);
    const { refs, avatarIds } = inputs;

    const dangling = danglingMentions(rawInstruction, refs);
    if (dangling.length) return apiError(danglingMentionMessage(dangling), 400);

    const hasAvatar = refs.some((r) => r.role === "avatar");
    const requested = typeof body?.modelId === "string" ? body.modelId : undefined;
    const lock = compositeModelLock(hasAvatar);
    if (lock && requested && requested !== lock) {
      return apiError("A composite with an avatar is made with Seedream, so Seedance and Gemini Omni accept it.", 400);
    }
    const modelId = resolveCompositeModelId(requested, hasAvatar);
    const config = imageGenRegistry[modelId];
    if (!config) return apiError(`Unknown modelId: ${modelId}`, 400);

    const parsed = config.schema.safeParse(body?.params ?? {});
    if (!parsed.success) return apiError(`Invalid params: ${parsed.error.message}`, 400);
    const validatedParams = parsed.data as Record<string, unknown>;

    const images = referenceImagesOf(refs);
    // Never slice: every later "image N" the instruction resolved to would point at the wrong one.
    if (images.length > config.maxReferenceImages) {
      return apiError(
        `${images.length} reference images are connected — ${config.label} takes ${config.maxReferenceImages}. Disconnect some before generating.`,
        422,
      );
    }
    const validation = validateReferenceImages(images, config);
    if (!validation.ok) {
      const count = validation.violations.length;
      return apiError(
        count === 1
          ? `One of your reference images can't be used: ${validation.violations[0].message}`
          : `${count} reference images can't be used — resize them before generating.`,
        422,
      );
    }

    const referenceUrls = images.map((i) => i.url);
    const prompt = buildCompositePrompt({ refs, instruction: resolveCompositeMentions(rawInstruction, refs) });
    const inputsUsed = {
      promptId: COMPOSITE_PROMPT_ID,
      instruction: rawInstruction,
      prompt,
      referenceImageUrls: referenceUrls,
      avatarIds,
    };

    const generation = await insertGeneration({
      nodeId,
      orgId: effectiveOrgId,
      clientId,
      userId: caller.userId,
      userEmail: caller.email,
      type: "image",
      modelUsed: modelId,
      paramsSnapshot: validatedParams,
      inputsSnapshot: inputsUsed,
    });

    try {
      const costUsd = estimateImageGenerationCostUsd({
        modelId,
        quality: validatedParams.quality as string | undefined,
        aspectRatio: validatedParams.aspect_ratio as string | undefined,
        imageSize: validatedParams.image_size as string | undefined,
        referenceUrls,
      });
      if (costUsd === null) throw new Error(`No cost estimate available for ${modelId} at this quality/size.`);
      const reservation = await reserveCredits(effectiveOrgId, generation.id, usdToFinalCredits(costUsd));
      if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");

      const result = await config.generate({ prompt, referenceUrls, params: validatedParams });

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
          ...validatedParams,
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
      await settleGeneration({ orgId: effectiveOrgId, generationId: generation.id, actualAmount: actualCredits });
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
        paramsUsed: { modelId, ...validatedParams },
        modelUsed: modelId,
        error: message,
      }).catch(() => null);
      await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
      await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
      return apiError(message, e instanceof CreditLimitError ? 402 : 500);
    }
  });
}
