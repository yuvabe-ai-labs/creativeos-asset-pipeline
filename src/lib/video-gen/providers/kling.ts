import "server-only";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { klingLegacyParams, klingV3Params } from "../params/kling";

const KLING_API_BASE = "https://api.klingai.com/v1";

function getApiKey(): string {
  const key = process.env.KLING_API_KEY;
  if (!key) throw new Error("Missing KLING_API_KEY");
  return key;
}

async function fetchAsBase64(
  url: string,
): Promise<{ imageBase64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${url}`);
  const mimeType = (res.headers.get("content-type") ?? "image/jpeg")
    .split(";")[0]
    .trim();
  const imageBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { imageBase64, mimeType };
}

type KlingRequestBodyInput = {
  modelName: string;
  imageBase64: string;
  mimeType: string;
  prompt: string;
  params: Record<string, unknown>;
  callbackUrl: string;
};

export function buildKlingRequestBody(input: KlingRequestBodyInput): Record<string, unknown> {
  const { modelName, imageBase64, prompt, params, callbackUrl } = input;

  const pan = Number(params.pan ?? 0);
  const tilt = Number(params.tilt ?? 0);
  const zoom = Number(params.zoom ?? 0);
  const roll = Number(params.roll ?? 0);
  const horizontal = Number(params.horizontal_movement ?? 0);
  const vertical = Number(params.vertical_movement ?? 0);
  const hasMotion = [pan, tilt, zoom, roll, horizontal, vertical].some((v) => v !== 0);

  const negativePrompt = String(params.negative_prompt ?? "").trim();

  return {
    model_name: modelName,
    image: imageBase64,
    prompt,
    mode: String(params.mode ?? "pro"),
    duration: Number(params.duration ?? 5),
    aspect_ratio: String(params.aspect_ratio ?? "16:9"),
    cfg_scale: Number(params.cfg_scale ?? 0.5),
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    ...(hasMotion
      ? {
          camera_control: {
            type: "customize",
            config: { pan, tilt, zoom, roll, horizontal, vertical },
          },
        }
      : {}),
    callback_url: callbackUrl,
  };
}

type KlingCreateResponse = {
  code: number;
  message: string;
  data: { task_id: string; task_status: string };
};

async function generateWithKling(
  modelName: string,
  input: VideoGenInput,
): Promise<VideoGenResult> {
  const apiKey = getApiKey();
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("Missing APP_URL");
  const secret = process.env.TRIGGER_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing TRIGGER_WEBHOOK_SECRET");

  if (!input.startFrameUrl) {
    throw new Error("Kling image-to-video requires a start frame image");
  }

  const { imageBase64, mimeType } = await fetchAsBase64(input.startFrameUrl);

  const callbackUrl = `${appUrl}/api/webhooks/generation?provider=kling&token=${encodeURIComponent(secret)}`;
  const body = buildKlingRequestBody({
    modelName,
    imageBase64,
    mimeType,
    prompt: input.prompt,
    params: input.params,
    callbackUrl,
  });

  const res = await fetch(`${KLING_API_BASE}/videos/image2video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as KlingCreateResponse;
  if (json.code !== 0) {
    throw new Error(`Kling API rejected request: ${json.message}`);
  }

  const taskId = json.data.task_id;
  const durationSeconds = Number(input.params.duration ?? 5);

  // Return immediately — Kling will POST to callbackUrl on completion.
  // providerJobId is stored in generations.provider_job_id for webhook lookup.
  return {
    videoUrl: "",
    durationSeconds,
    providerJobId: taskId,
  };
}

const KLING_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: false,
  maxReferenceImages: 0,
} as const;

function makeKlingModel(
  id: string,
  label: string,
  modelName: string,
  maxDurationSeconds: number,
  params: typeof klingLegacyParams,
): VideoGenModelSpec {
  return {
    id,
    provider: "kling",
    label,
    providerLabel: "Kling",
    maxDurationSeconds,
    imageInputs: KLING_IMAGE_INPUTS,
    params,
    generate: (input) => generateWithKling(modelName, input),
  };
}

export const klingV15 = makeKlingModel("kling:kling-v1-5", "Kling 1.5", "kling-v1-5", 10, klingLegacyParams);
export const klingV16 = makeKlingModel("kling:kling-v1-6", "Kling 1.6", "kling-v1-6", 10, klingLegacyParams);
export const klingV21 = makeKlingModel("kling:kling-v2-1", "Kling 2.1", "kling-v2-1", 10, klingLegacyParams);
export const klingV21Master = makeKlingModel("kling:kling-v2-1-master", "Kling 2.1 Master", "kling-v2-1-master", 10, klingLegacyParams);
export const klingV26 = makeKlingModel("kling:kling-v2-6", "Kling 2.6", "kling-v2-6", 10, klingLegacyParams);
export const klingV3 = makeKlingModel("kling:kling-v3", "Kling 3.0", "kling-v3", 15, klingV3Params);
