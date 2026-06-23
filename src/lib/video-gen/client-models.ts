import type { VideoGenClientModelSpec } from "./types";
import { veoParams, veoLiteParams } from "./params/veo";
import { soraParams } from "./params/sora";

const VEO_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 3,
} as const;

export const videoGenClientModelMap: Record<string, VideoGenClientModelSpec> = {
  "veo:veo-3.1-lite": {
    id: "veo:veo-3.1-lite",
    provider: "veo",
    label: "Veo 3.1 Lite",
    providerLabel: "Google",
    maxDurationSeconds: 5,
    imageInputs: VEO_IMAGE_INPUTS,
    params: veoLiteParams,
  },
  "veo:veo-3.1-fast": {
    id: "veo:veo-3.1-fast",
    provider: "veo",
    label: "Veo 3.1 Fast",
    providerLabel: "Google",
    maxDurationSeconds: 5,
    imageInputs: VEO_IMAGE_INPUTS,
    params: veoLiteParams,
  },
  "veo:veo-3.1": {
    id: "veo:veo-3.1",
    provider: "veo",
    label: "Veo 3.1 Quality",
    providerLabel: "Google",
    maxDurationSeconds: 8,
    imageInputs: VEO_IMAGE_INPUTS,
    params: veoParams,
  },
  "openai:sora-2": {
    id: "openai:sora-2",
    provider: "openai",
    label: "Sora 2",
    providerLabel: "OpenAI",
    maxDurationSeconds: 12,
    imageInputs: { startFrame: true, endFrame: false, maxReferenceImages: 0 },
    params: soraParams,
  },
};

export const DEFAULT_VIDEO_CLIENT_MODEL_ID = "veo:veo-3.1-fast";

// Extract defaults from ParamSpec array — reads p.name and p.defaultValue
export function defaultsForVideoModel(modelId: string): Record<string, unknown> {
  const spec = videoGenClientModelMap[modelId];
  if (!spec) return {};
  return Object.fromEntries(
    spec.params
      .filter((p) => p.defaultValue !== null && p.defaultValue !== undefined)
      .map((p) => [p.name, p.defaultValue]),
  );
}
