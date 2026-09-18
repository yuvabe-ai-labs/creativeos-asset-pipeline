// EXPERIMENT (throwaway) — minimal BytePlus ModelArk client.
// Deliberately not a provider-registry implementation: this probes API support,
// it is not a candidate for the canvas video-gen spine.

import { ARK_BASE_URL, SEEDANCE_MODEL, SEEDREAM_MODEL } from "./constants";

export type ArkCall = {
  request: unknown;
  response: unknown;
  status: number;
};

function apiKey(): string {
  const key = process.env.BYTE_PLUS_API_KEY;
  if (!key) {
    throw new Error("BYTE_PLUS_API_KEY is not set — add it to .env.local");
  }
  return key;
}

// Every call returns the raw request and response alongside the parsed result.
// Moderation rejections are the interesting outcome of this experiment, so the UI
// needs the untouched error body, not a prettified message.
async function ark(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<ArkCall> {
  const res = await fetch(`${ARK_BASE_URL}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let response: unknown;
  try {
    response = JSON.parse(text);
  } catch {
    response = { raw: text.slice(0, 2000) };
  }

  return { request: init.body ?? { path }, response, status: res.status };
}

export type SeedreamResult = ArkCall & { imageUrl: string | null };

export async function generateImage(prompt: string, size = "2K"): Promise<SeedreamResult> {
  const call = await ark("/images/generations", {
    method: "POST",
    body: {
      model: SEEDREAM_MODEL,
      prompt,
      size,
      response_format: "url",
      watermark: false,
    },
  });

  const data = (call.response as { data?: { url?: string }[] })?.data;
  return { ...call, imageUrl: data?.[0]?.url ?? null };
}

export type VideoContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role?: "reference_image" | "first_frame" | "last_frame" };

export type SeedanceTaskResult = ArkCall & { taskId: string | null };

export async function createVideoTask(content: VideoContentPart[]): Promise<SeedanceTaskResult> {
  const call = await ark("/contents/generations/tasks", {
    method: "POST",
    body: { model: SEEDANCE_MODEL, content },
  });

  const id = (call.response as { id?: string })?.id ?? null;
  return { ...call, taskId: id };
}

export type SeedanceStatus = ArkCall & {
  taskStatus: string | null;
  videoUrl: string | null;
};

export async function getVideoTask(taskId: string): Promise<SeedanceStatus> {
  const call = await ark(`/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    method: "GET",
  });

  const body = call.response as { status?: string; content?: { video_url?: string } };
  return {
    ...call,
    taskStatus: body?.status ?? null,
    videoUrl: body?.content?.video_url ?? null,
  };
}
