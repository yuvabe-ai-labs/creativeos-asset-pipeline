import "server-only";
import { GoogleGenAI, VideoGenerationReferenceType } from "@google/genai";
import type {
  VideoGenInput,
  VideoGenResult,
  VideoGenModelSpec,
} from "../types";
import { veoParams, veoLiteParams } from "../params/veo";

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

// SDK Image_2 only accepts gcsUri or imageBytes — plain HTTPS URLs must be fetched first.
async function fetchAsBase64(
  url: string,
): Promise<{ imageBytes: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${url}`);
  const mimeType = (res.headers.get("content-type") ?? "image/jpeg")
    .split(";")[0]
    .trim();
  const imageBytes = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { imageBytes, mimeType };
}

async function generateWithVeo(
  modelName: string,
  input: VideoGenInput,
  maxRefImages = 3,
): Promise<VideoGenResult> {
  const ai = createVeoClient();
  const VALID_DURATIONS = [4, 6, 8];
  const parsed = Number(input.params.duration);
  const durationSeconds = VALID_DURATIONS.includes(parsed) ? parsed : 6;
  const aspectRatio = String(input.params.aspect_ratio ?? "16:9");

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
    aspectRatio,
    durationSeconds,
    numberOfVideos: 1,
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
    prompt: input.prompt,
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

const VEO_QUALITY_IMAGE_INPUTS = {
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
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.lite, input, 0),
};

export const veoFast: VideoGenModelSpec = {
  id: "veo:veo-3.1-fast",
  provider: "veo",
  label: "Veo 3.1 Fast",
  providerLabel: "Google",
  maxDurationSeconds: 8,
  imageInputs: VEO_QUALITY_IMAGE_INPUTS,
  params: veoParams,
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.fast, input, 3),
};

export const veoQuality: VideoGenModelSpec = {
  id: "veo:veo-3.1",
  provider: "veo",
  label: "Veo 3.1 Quality",
  providerLabel: "Google",
  maxDurationSeconds: 8,
  imageInputs: VEO_QUALITY_IMAGE_INPUTS,
  params: veoParams,
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.quality, input, 3),
};
