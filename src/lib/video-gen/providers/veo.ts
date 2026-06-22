import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { veoParams, veoLiteParams } from "../params/veo";

const VEO_MODEL_IDS = {
  lite:    "veo-3.1-lite-generate-001",
  fast:    "veo-3.1-fast-generate-001",
  quality: "veo-3.1-generate-001",
} as const;

function createVeoClient() {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_GENAI_API_KEY");
  return new GoogleGenAI({ apiKey });
}

async function generateWithVeo(
  modelName: string,
  input: VideoGenInput,
): Promise<VideoGenResult> {
  const ai = createVeoClient();
  const durationSeconds = Number(input.params.duration ?? 5);
  const generateAudio = Boolean(input.params.audio ?? false);
  const aspectRatio = String(input.params.aspect_ratio ?? "16:9");

  const config: Record<string, unknown> = {
    aspectRatio,
    durationSeconds,
    numberOfVideos: 1,
    generateAudio,
  };

  if (input.startFrameUrl) {
    config.image = { imageUrl: input.startFrameUrl };
  }

  // Initiate video generation (long-running operation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let operation = await (ai.models as any).generateVideo({
    model: modelName,
    prompt: input.prompt,
    config,
  });

  // Poll until complete (runs inside Trigger.dev — no timeout concern)
  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    operation = await (ai.operations as any).get(operation);
  }

  if (operation.error) {
    throw new Error(`Veo generation failed: ${JSON.stringify(operation.error)}`);
  }

  const videoUri =
    operation.response?.generatedSamples?.[0]?.video?.uri ??
    operation.response?.videos?.[0]?.uri;

  if (!videoUri) {
    throw new Error("Veo returned no video URI in response");
  }

  return { videoUrl: videoUri, durationSeconds };
}

export const veoLite: VideoGenModelSpec = {
  id: "veo:veo-3.1-lite",
  provider: "veo",
  label: "Veo 3.1 Lite",
  providerLabel: "Google",
  maxDurationSeconds: 5,
  params: veoLiteParams,
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.lite, input),
};

export const veoFast: VideoGenModelSpec = {
  id: "veo:veo-3.1-fast",
  provider: "veo",
  label: "Veo 3.1 Fast",
  providerLabel: "Google",
  maxDurationSeconds: 5,
  params: veoLiteParams,
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.fast, input),
};

export const veoQuality: VideoGenModelSpec = {
  id: "veo:veo-3.1",
  provider: "veo",
  label: "Veo 3.1 Quality",
  providerLabel: "Google",
  maxDurationSeconds: 8,
  params: veoParams,
  generate: (input) => generateWithVeo(VEO_MODEL_IDS.quality, input),
};
