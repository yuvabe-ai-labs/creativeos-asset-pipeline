// D376 — fal queue REST client. Lip sync (D376) and Kling video (D484) both submit through it.
// No `server-only`: the Trigger tasks import it.
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
const VideoResultSchema = z.object({ video: z.object({ url: z.string() }) });

export type FalJob = { requestId: string; statusUrl: string; responseUrl: string };

/**
 * Queue a job on any fal endpoint. fal bills the job once this returns, so a caller must never
 * resubmit after it succeeds. The status and response URLs fal returns are used as given: for an
 * endpoint with a sub-path (`fal-ai/kling-video/v3/pro/image-to-video`) they are rooted at the app
 * id, not the full path, so building them ourselves would 404.
 */
export async function submitFalJob(endpoint: string, body: Record<string, unknown>, what: string, fetchImpl: typeof fetch = fetch): Promise<FalJob> {
  const out = await call(`${FAL_QUEUE_BASE}/${endpoint}`, { method: "POST", body: JSON.stringify(body) }, SubmitSchema, `${what} submit`, fetchImpl);
  return { requestId: out.request_id, statusUrl: out.status_url, responseUrl: out.response_url };
}

export async function submitLipSync(
  args: { videoUrl: string; audioUrl: string; model: string },
  fetchImpl: typeof fetch = fetch,
): Promise<FalJob> {
  const body = { model: args.model, video_url: args.videoUrl, audio_url: args.audioUrl, sync_mode: "cut_off" };
  return submitFalJob(FAL_LIPSYNC_ENDPOINT, body, "lip sync", fetchImpl);
}

export async function getFalStatus(statusUrl: string, fetchImpl: typeof fetch = fetch) {
  return (await call(statusUrl, { method: "GET" }, StatusSchema, "status", fetchImpl)).status;
}

/** The finished video of a completed job. A job that failed at fal answers non-2xx: FalHttpError. */
export async function getFalVideoResult(responseUrl: string, what: string, fetchImpl: typeof fetch = fetch): Promise<{ videoUrl: string }> {
  return { videoUrl: (await call(responseUrl, { method: "GET" }, VideoResultSchema, `${what} result`, fetchImpl)).video.url };
}

export async function getLipSyncResult(responseUrl: string, fetchImpl: typeof fetch = fetch): Promise<{ videoUrl: string }> {
  return getFalVideoResult(responseUrl, "lip sync", fetchImpl);
}
