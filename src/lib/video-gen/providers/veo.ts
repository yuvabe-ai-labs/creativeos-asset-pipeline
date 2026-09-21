import "server-only";
import { GoogleGenAI, VideoGenerationReferenceType } from "@google/genai";
import type {
  VideoGenInput,
  VideoGenResult,
  VideoGenModelSpec,
} from "../types";
import { veoParams, veoLiteParams } from "../params/veo";
import { fetchAsBase64 } from "./fetch-as-base64";
import { avoidClause } from "./avoid-clause";

const VEO_MODEL_IDS = {
  lite: "veo-3.1-lite-generate-preview",
  fast: "veo-3.1-fast-generate-preview",
  quality: "veo-3.1-generate-preview",
} as const;

function createVeoClient() {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_GENAI_API_KEY");
  return new GoogleGenAI({ apiKey });
}

// Per-model quirks that change the request shape rather than its values.
type VeoModelCapabilities = {
  maxRefImages: number;
  /**
   * Lite rejects `negativePrompt` outright — 400 INVALID_ARGUMENT, "isn't supported by this
   * model" — so the field must be absent, not empty. The suppression list is not discarded when
   * this is false: composeVeoPrompt folds it into the prompt text instead.
   */
  supportsNegativePrompt: boolean;
};

/**
 * The prompt actually sent, given a model that has no `negativePrompt` field.
 *
 * Veo's native negativePrompt is a separate channel; with it unavailable the only place left to
 * state a suppression list is the prompt itself. "Avoid:" is a plain instruction Veo's text
 * encoder handles directly, and it is appended as its own paragraph so it cannot be read as a
 * continuation of the shot description — the list is comma-separated defect names
 * (VEO_NEGATIVE_DEFAULT), which would otherwise run straight into the last sentence.
 *
 * Returns the prompt unchanged when there is nothing to suppress, so a cleared field never
 * leaves a dangling "Avoid:" on the request.
 */
export function composeVeoPrompt(prompt: string, negativePrompt: string): string {
  const avoid = avoidClause(negativePrompt);
  if (!avoid) return prompt;
  return `${prompt.trim()}\n\n${avoid}`;
}

// Pure config builder (D78) — scalar Veo GenerateVideosConfig fields, unit-testable.
// Image fields (image / lastFrame / referenceImages) are added by generateWithVeo after fetch.
// enhancePrompt is deliberately NOT set — Veo's built-in prompt rewriter stays at its default.
export function buildVeoConfig(
  params: Record<string, unknown>,
  opts: { supportsNegativePrompt?: boolean } = {},
): {
  aspectRatio: string;
  durationSeconds: number;
  numberOfVideos: number;
  resolution: string;
  negativePrompt?: string;
} {
  const VALID_DURATIONS = [4, 6, 8];
  const parsed = Number(params.duration);
  const durationSeconds = VALID_DURATIONS.includes(parsed) ? parsed : 6;
  const aspectRatio = String(params.aspect_ratio ?? "16:9");
  const resolution = String(params.resolution ?? "720p");
  const supportsNegativePrompt = opts.supportsNegativePrompt ?? true;
  const negativePrompt = supportsNegativePrompt
    ? String(params.negative_prompt ?? "").trim()
    : "";
  return {
    aspectRatio,
    durationSeconds,
    numberOfVideos: 1,
    resolution,
    ...(negativePrompt ? { negativePrompt } : {}),
  };
}

async function generateWithVeo(
  modelName: string,
  input: VideoGenInput,
  caps: VeoModelCapabilities,
): Promise<VideoGenResult> {
  const { maxRefImages } = caps;
  const ai = createVeoClient();
  const baseConfig = buildVeoConfig(input.params, {
    supportsNegativePrompt: caps.supportsNegativePrompt,
  });
  // buildVeoConfig has already dropped the field for a model that cannot take it; the same
  // condition decides where the list goes instead.
  const prompt = caps.supportsNegativePrompt
    ? input.prompt
    : composeVeoPrompt(input.prompt, String(input.params.negative_prompt ?? ""));
  const durationSeconds = baseConfig.durationSeconds;

  // Fetch start + end frames in parallel
  const [startImage, endImage] = await Promise.all([
    input.startFrameUrl
      ? fetchAsBase64(input.startFrameUrl)
      : Promise.resolve(null),
    input.endFrameUrl
      ? fetchAsBase64(input.endFrameUrl)
      : Promise.resolve(null),
  ]);

  // SDK constraint: referenceImages can't be combined with image/lastFrame.
  // Only fetch refs when there's no start frame, and only for models that support it.
  const refUrls = startImage
    ? []
    : (input.referenceUrls ?? []).slice(0, maxRefImages);
  const refImages =
    refUrls.length > 0 ? await Promise.all(refUrls.map(fetchAsBase64)) : [];

  const config = {
    ...baseConfig,
    ...(endImage ? { lastFrame: endImage } : {}),
    ...(refImages.length > 0
      ? {
          referenceImages: refImages.map((img) => ({
            referenceType: VideoGenerationReferenceType.ASSET,
            image: img,
          })),
        }
      : {}),
  };

  // Initiate video generation (long-running operation)
  let operation = await ai.models.generateVideos({
    model: modelName,
    prompt,
    ...(startImage ? { image: startImage } : {}),
    config,
  });

  // Poll until complete (inside Trigger.dev — no timeout concern)
  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  if (operation.error) {
    throw new Error(
      `Veo generation failed: ${JSON.stringify(operation.error)}`,
    );
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) {
    throw new Error("Veo returned no video URI in response");
  }

  return { videoUrl: videoUri, durationSeconds };
}

const VEO_LITE_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 0,
} as const;

const VEO_REFS_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 3,
} as const;

export const veoLite: VideoGenModelSpec = {
  id: "veo:veo-3.1-lite",
  provider: "veo",
  label: "Veo 3.1 Lite",
  providerLabel: "Google",
  maxDurationSeconds: 8,
  imageInputs: VEO_LITE_IMAGE_INPUTS,
  params: veoLiteParams,
  generate: (input) =>
    generateWithVeo(VEO_MODEL_IDS.lite, input, {
      maxRefImages: 0,
      supportsNegativePrompt: false,
    }),
};

export const veoFast: VideoGenModelSpec = {
  id: "veo:veo-3.1-fast",
  provider: "veo",
  label: "Veo 3.1 Fast",
  providerLabel: "Google",
  maxDurationSeconds: 8,
  imageInputs: VEO_REFS_IMAGE_INPUTS,
  params: veoParams,
  generate: (input) =>
    generateWithVeo(VEO_MODEL_IDS.fast, input, {
      maxRefImages: 3,
      supportsNegativePrompt: true,
    }),
};

export const veoQuality: VideoGenModelSpec = {
  id: "veo:veo-3.1",
  provider: "veo",
  label: "Veo 3.1 Quality",
  providerLabel: "Google",
  maxDurationSeconds: 8,
  imageInputs: VEO_REFS_IMAGE_INPUTS,
  params: veoParams,
  generate: (input) =>
    generateWithVeo(VEO_MODEL_IDS.quality, input, {
      maxRefImages: 3,
      supportsNegativePrompt: true,
    }),
};
