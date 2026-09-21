// Minimal BytePlus ModelArk client for the UGC bench. Carried over from the 2026-09-18
// spike; errors are returned (not thrown) so the UI can show the raw moderation reason.
import { ARK_BASE_URL, SEEDREAM_MODEL, type SeedanceModelId } from "./constants";

function apiKey(): string {
  const key = process.env.BYTE_PLUS_API_KEY;
  if (!key) throw new Error("BYTE_PLUS_API_KEY is not set — add it to .env.local");
  return key;
}

type ArkError = { error?: { code?: string; message?: string } };

async function ark(path: string, method: "GET" | "POST", body?: unknown) {
  const res = await fetch(`${ARK_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown> & ArkError;
  } catch {
    return { error: { code: String(res.status), message: text.slice(0, 500) } };
  }
}

function errorOf(r: ArkError): string | null {
  return r.error ? [r.error.code, r.error.message].filter(Boolean).join(": ") : null;
}

export async function generateImage(prompt: string) {
  const r = await ark("/images/generations", "POST", {
    model: SEEDREAM_MODEL,
    prompt,
    size: "2K",
    response_format: "url",
    watermark: false,
  });
  const url = (r.data as { url?: string }[] | undefined)?.[0]?.url ?? null;
  return { imageUrl: url, error: url ? null : (errorOf(r) ?? "Seedream returned no image") };
}

export async function createVideoTask(args: {
  model: SeedanceModelId;
  prompt: string;
  referenceUrl: string;
}) {
  const r = await ark("/contents/generations/tasks", "POST", {
    model: args.model,
    content: [
      { type: "text", text: args.prompt },
      // Verbatim — any copy or re-encode of a Seedream face loses trusted status.
      { type: "image_url", image_url: { url: args.referenceUrl }, role: "reference_image" },
    ],
  });
  const taskId = (r.id as string | undefined) ?? null;
  return { taskId, error: taskId ? null : (errorOf(r) ?? "Seedance refused the task") };
}

export async function getVideoTask(taskId: string) {
  const r = await ark(`/contents/generations/tasks/${encodeURIComponent(taskId)}`, "GET");
  const status = (r.status as string | undefined) ?? null;
  const videoUrl = (r.content as { video_url?: string } | undefined)?.video_url ?? null;
  return { status, videoUrl, error: errorOf(r) };
}
