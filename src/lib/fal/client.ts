// D376 — fal queue REST client for sync lipsync v2. No `server-only`: the Trigger task imports it.
import { z } from "zod";

export const FAL_QUEUE_BASE = "https://queue.fal.run";
export const FAL_LIPSYNC_ENDPOINT = "fal-ai/sync-lipsync/v2";

export class FalHttpError extends Error {
  readonly status: number;
  constructor(status: number, detail: string, what: string) {
    super(`fal ${what} failed: ${status} ${detail.slice(0, 300)}`);
    this.name = "FalHttpError";
    this.status = status;
  }
}

function key(): string {
  const k = process.env.FAL_KEY;
  if (!k) throw new Error("FAL_KEY is not set");
  return k;
}

async function call<T>(url: string, init: RequestInit, schema: z.ZodType<T>, what: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, { ...init, headers: { Authorization: `Key ${key()}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  if (!res.ok) throw new FalHttpError(res.status, await res.text().catch(() => ""), what);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error(`fal ${what} returned an unexpected body: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

const SubmitSchema = z.object({ request_id: z.string(), status_url: z.string(), response_url: z.string() });
const StatusSchema = z.object({ status: z.enum(["IN_QUEUE", "IN_PROGRESS", "COMPLETED"]) });
const ResultSchema = z.object({ video: z.object({ url: z.string() }) });

export async function submitLipSync(
  args: { videoUrl: string; audioUrl: string; model: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ requestId: string; statusUrl: string; responseUrl: string }> {
  const body = { model: args.model, video_url: args.videoUrl, audio_url: args.audioUrl, sync_mode: "cut_off" };
  const out = await call(`${FAL_QUEUE_BASE}/${FAL_LIPSYNC_ENDPOINT}`, { method: "POST", body: JSON.stringify(body) }, SubmitSchema, "lip sync submit", fetchImpl);
  return { requestId: out.request_id, statusUrl: out.status_url, responseUrl: out.response_url };
}

export async function getFalStatus(statusUrl: string, fetchImpl: typeof fetch = fetch) {
  return (await call(statusUrl, { method: "GET" }, StatusSchema, "status", fetchImpl)).status;
}

export async function getLipSyncResult(responseUrl: string, fetchImpl: typeof fetch = fetch): Promise<{ videoUrl: string }> {
  return { videoUrl: (await call(responseUrl, { method: "GET" }, ResultSchema, "lip sync result", fetchImpl)).video.url };
}
