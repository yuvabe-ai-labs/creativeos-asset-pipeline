import "server-only";
import { logger } from "@trigger.dev/sdk/v3";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { kling30Params, klingO1Params } from "../params/kling";

const KLING_API_BASE = "https://api-singapore.klingai.com";
const POLL_INTERVAL_MS = 5_000;

function getApiKey(): string {
  const key = process.env.KLING_API_KEY;
  if (!key) throw new Error("Missing KLING_API_KEY");
  return key;
}

type KlingContentInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
};

export function buildKlingContents(
  input: KlingContentInput,
): Array<Record<string, unknown>> {
  const contents: Array<Record<string, unknown>> = [
    { type: "prompt", text: input.prompt },
  ];
  if (input.startFrameUrl) {
    contents.push({ type: "first_frame", url: input.startFrameUrl });
  }
  if (input.endFrameUrl) {
    contents.push({ type: "last_frame", url: input.endFrameUrl });
  }
  return contents;
}

const KLING_OPTIONS = { watermark_info: { enabled: false } };

// Kling's field is snake_case `negative_prompt` (Veo's SDK uses camelCase `negativePrompt`).
// Omitted entirely when blank so an emptied box sends no negative at all.
function negativePromptSetting(params: Record<string, unknown>): Record<string, unknown> {
  const negativePrompt = String(params.negative_prompt ?? "").trim();
  return negativePrompt ? { negative_prompt: negativePrompt } : {};
}

export function build3_0Settings(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    multi_shot: Boolean(params.multi_shot ?? true),
    audio: String(params.audio ?? "off"),
    resolution: String(params.resolution ?? "720p"),
    duration: Number(params.duration ?? 5),
    ...negativePromptSetting(params),
  };
}

export function buildO1Settings(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    audio: String(params.audio ?? "off"),
    resolution: String(params.resolution ?? "720p"),
    duration: Number(params.duration ?? 5),
    ...negativePromptSetting(params),
  };
}

type KlingCreateResponse = {
  code: number;
  message: string;
  data: { id: string; status: string };
};

async function createKlingTask(
  endpointPath: string,
  contents: Array<Record<string, unknown>>,
  settings: Record<string, unknown>,
): Promise<string> {
  const apiKey = getApiKey();
  const res = await fetch(`${KLING_API_BASE}${endpointPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ contents, settings, options: KLING_OPTIONS }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling create failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as KlingCreateResponse;
  if (json.code !== 0) throw new Error(`Kling create rejected: ${json.message}`);
  return json.data.id;
}

type KlingTaskOutput = { type: string; url: string; duration?: string };
type KlingTask = {
  id: string;
  status: "submitted" | "processing" | "succeeded" | "failed";
  message?: string;
  outputs?: KlingTaskOutput[];
};
type KlingQueryResponse = { code: number; message: string; data: KlingTask[] };

async function pollKlingTask(taskId: string): Promise<VideoGenResult> {
  const apiKey = getApiKey();
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(`${KLING_API_BASE}/tasks?task_ids=${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Kling poll failed (${res.status})`);
    const json = (await res.json()) as KlingQueryResponse;
    const kTask = json.data[0];

    logger.info("Kling task status", { taskId, status: kTask?.status });

    if (kTask?.status === "succeeded") {
      const video = kTask.outputs?.find((o) => o.type === "video");
      if (!video) throw new Error("Kling task succeeded but returned no video output");
      return {
        videoUrl: video.url,
        durationSeconds: Number(video.duration ?? 0),
      };
    }
    if (kTask?.status === "failed") {
      throw new Error(`Kling generation failed: ${kTask.message ?? "unknown error"}`);
    }
  }
}

async function generateWithKling(
  endpointPath: string,
  buildSettings: (params: Record<string, unknown>) => Record<string, unknown>,
  input: VideoGenInput,
): Promise<VideoGenResult> {
  if (!input.startFrameUrl) {
    throw new Error("Kling image-to-video requires a start frame image");
  }
  const contents = buildKlingContents(input);
  const settings = buildSettings(input.params);
  const taskId = await createKlingTask(endpointPath, contents, settings);
  return pollKlingTask(taskId);
}

const KLING_IMAGE_INPUTS_WITH_END = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 0,
} as const;

export const kling30: VideoGenModelSpec = {
  id: "kling:kling-3-0",
  provider: "kling",
  label: "Kling 3.0",
  providerLabel: "Kling",
  maxDurationSeconds: 15,
  imageInputs: KLING_IMAGE_INPUTS_WITH_END,
  params: kling30Params,
  generate: (input) => generateWithKling("/image-to-video/kling-3.0", build3_0Settings, input),
};

export const klingO1: VideoGenModelSpec = {
  id: "kling:kling-o1",
  provider: "kling",
  label: "Kling O1",
  providerLabel: "Kling",
  maxDurationSeconds: 10,
  imageInputs: KLING_IMAGE_INPUTS_WITH_END,
  params: klingO1Params,
  generate: (input) => generateWithKling("/omni-video/kling-o1", buildO1Settings, input),
};
