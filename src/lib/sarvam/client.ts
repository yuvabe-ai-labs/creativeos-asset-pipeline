// D376 — Sarvam Dubbing REST client. No `server-only`: the Trigger task imports it.
// Shapes per the API reference (docs.sarvam.ai/api-reference/creative-agents-dubbing, 2026-10-15),
// parsed through zod so a changed field fails loudly instead of reading as "not done yet".
import { z } from "zod";

export const SARVAM_API_BASE = "https://api.sarvam.ai";

export class SarvamKeyMissingError extends Error {
  constructor() {
    super("SARVAM_API_KEY is not set");
    this.name = "SarvamKeyMissingError";
  }
}

export class SarvamHttpError extends Error {
  readonly status: number;
  constructor(status: number, detail: string, what: string) {
    super(`Sarvam ${what} failed: ${status} ${detail.slice(0, 300)}`);
    this.name = "SarvamHttpError";
    this.status = status;
  }
}

function key(): string {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new SarvamKeyMissingError();
  return k;
}

async function call<T>(path: string, init: RequestInit, schema: z.ZodType<T>, what: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${SARVAM_API_BASE}${path}`, {
    ...init,
    headers: { "api-subscription-key": key(), ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (!res.ok) throw new SarvamHttpError(res.status, await res.text().catch(() => ""), what);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error(`Sarvam ${what} returned an unexpected body: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

const CreateSchema = z.object({ data: z.object({ job_id: z.string(), upload_url: z.string().nullable() }) });
// The start reply is never read, so a 2xx must not throw over its shape.
const StartSchema = z.unknown();
const JOB_STATUSES = ["not_started", "queued", "in_progress", "completed", "failed", "partial_failure", "deleted"] as const;
export type SarvamJobStatus = (typeof JOB_STATUSES)[number];
const LiveSchema = z.object({
  data: z.object({
    status: z.enum(JOB_STATUSES),
    progress: z.number().default(0),
    current_step_label: z.string().nullable().optional(),
    error_message: z.string().nullable().optional(),
  }),
});
const ExportsSchema = z.object({
  data: z.object({
    exports: z.array(z.object({
      export_type: z.string(),
      target_language: z.string(),
      status: z.string(),
      download_url: z.string().nullable().optional(),
    })),
  }),
});

export type SarvamExport = { exportType: string; targetLanguage: string; status: string; downloadUrl: string | null };

export async function createDubJob(
  args: { srcLang: string; targetLang: string; jobName?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ jobId: string; uploadUrl: string }> {
  const body = {
    src_lang: args.srcLang,
    target_langs: [args.targetLang],
    voice_cloning: true,
    num_speakers: 1,
    disable_watermark: true,
    // false: exports run automatically after TTS (true is the dashboard editor, at double rate).
    editor_flow: false,
    ...(args.jobName ? { job_name: args.jobName } : {}),
  };
  const out = await call("/dubbing/jobs", { method: "POST", body: JSON.stringify(body) }, CreateSchema, "create job", fetchImpl);
  if (!out.data.upload_url) throw new Error("Sarvam create job returned no upload URL");
  return { jobId: out.data.job_id, uploadUrl: out.data.upload_url };
}

/** The signed upload URL is a blob store's; it takes no api key. */
export async function uploadDubMedia(uploadUrl: string, body: Buffer, contentType: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, "x-ms-blob-type": "BlockBlob" },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new SarvamHttpError(res.status, await res.text().catch(() => ""), "upload");
}

export async function startDubJob(jobId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await call(`/dubbing/jobs/${encodeURIComponent(jobId)}/start`, { method: "POST" }, StartSchema, "start job", fetchImpl);
}

export async function getDubLiveStatus(jobId: string, fetchImpl: typeof fetch = fetch) {
  const out = await call(`/dubbing/jobs/${encodeURIComponent(jobId)}/live-status`, { method: "GET" }, LiveSchema, "live status", fetchImpl);
  return {
    status: out.data.status,
    progress: out.data.progress,
    stepLabel: out.data.current_step_label ?? null,
    errorMessage: out.data.error_message ?? null,
  };
}

export async function getDubExports(jobId: string, fetchImpl: typeof fetch = fetch): Promise<SarvamExport[]> {
  const out = await call(`/dubbing/jobs/${encodeURIComponent(jobId)}/export-status?limit=20`, { method: "GET" }, ExportsSchema, "export status", fetchImpl);
  return out.data.exports.map((e) => ({
    exportType: e.export_type,
    targetLanguage: e.target_language,
    status: e.status,
    downloadUrl: e.download_url ?? null,
  }));
}
