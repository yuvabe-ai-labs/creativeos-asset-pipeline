import "server-only";
// OmniHuman 1.5 (BytePlus Vision AI): one portrait image + one audio track -> a video of that
// person speaking that audio. Unlike Seedance it does not invent speech; the audio IS the voice,
// and the model animates expression, head and body to match it.
//   docs.byteplus.com/en/docs/byteplus-vision/omnihuman-video_generation
import { accessKeys, signRequest } from "./sign";

export const OMNIHUMAN_REQ_KEY = "realman_avatar_picture_omni15_cv";
const VERSION = "2024-06-06";

// Task states from the query endpoint.
export const OMNIHUMAN_TERMINAL = ["done", "not_found", "expired", "canceled"];

export type CvResponse = {
  code?: number;
  message?: string;
  data?: { task_id?: string; status?: string; resp_data?: string; video_url?: string };
};

async function call(action: string, payload: Record<string, unknown>): Promise<CvResponse> {
  const body = JSON.stringify(payload);
  const { accessKeyId, secretAccessKey } = accessKeys();
  const signed = signRequest({ accessKeyId, secretAccessKey, action, version: VERSION, body });

  const res = await fetch(signed.url, { method: "POST", headers: signed.headers, body, cache: "no-store" });
  const text = await res.text();
  let parsed: CvResponse;
  try {
    parsed = JSON.parse(text) as CvResponse;
  } catch {
    parsed = { code: res.status, message: text.slice(0, 500) };
  }
  // code 10000 is success; anything else is worth a server-side trail.
  if (!res.ok || parsed.code !== 10000) {
    console.error(`[ugc] omnihuman ${action} → HTTP ${res.status} code ${parsed.code}`, parsed.message);
  }
  return parsed;
}

export async function submitOmniHumanTask(args: {
  imageUrl: string;
  audioUrl: string;
  prompt?: string;
  resolution?: 720 | 1080;
}): Promise<{ taskId: string | null; error: string | null }> {
  const r = await call("CVSubmitTask", {
    req_key: OMNIHUMAN_REQ_KEY,
    image_url: args.imageUrl,
    audio_url: args.audioUrl,
    ...(args.prompt?.trim() ? { prompt: args.prompt.trim() } : {}),
    output_resolution: args.resolution ?? 720,
  });
  const taskId = r.data?.task_id ?? null;
  return {
    taskId,
    error: taskId ? null : `${r.code ?? "?"}: ${r.message ?? "OmniHuman refused the task"}`,
  };
}

export async function getOmniHumanTask(
  taskId: string,
): Promise<{ status: string | null; videoUrl: string | null; error: string | null }> {
  const r = await call("CVGetResult", { req_key: OMNIHUMAN_REQ_KEY, task_id: taskId });
  const status = r.data?.status ?? null;

  // resp_data is a SERIALISED JSON string, not an object — the video url lives inside it.
  let videoUrl: string | null = r.data?.video_url ?? null;
  if (!videoUrl && r.data?.resp_data) {
    try {
      videoUrl = (JSON.parse(r.data.resp_data) as { video_url?: string }).video_url ?? null;
    } catch {
      videoUrl = null;
    }
  }

  const failed = r.code !== 10000;
  return {
    status,
    videoUrl,
    error: failed ? `${r.code ?? "?"}: ${r.message ?? "OmniHuman query failed"}` : null,
  };
}
