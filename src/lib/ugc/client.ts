// Minimal BytePlus ModelArk client for the UGC bench. Carried over from the 2026-09-18
// spike; errors are returned (not thrown) so the UI can show the raw moderation reason.
import { ARK_BASE_URL, SEEDREAM_MODEL, type SeedanceModelId } from "./constants";

function apiKey(): string {
  // BYTEPLUS_API_KEY is the product's name (video-gen/providers/seedance.ts); the old
  // experiment name is still read so existing .env.local files keep working.
  const key = process.env.BYTEPLUS_API_KEY ?? process.env.BYTE_PLUS_API_KEY;
  if (!key) throw new Error("BYTEPLUS_API_KEY is not set — add it to .env.local");
  return key;
}

type ArkError = { error?: { code?: string; message?: string } };

async function ark(path: string, method: "GET" | "POST", body?: unknown) {
  let res: Response;
  try {
    res = await fetch(`${ARK_BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (e) {
    console.error(`[ugc] ${method} ${path} — could not reach BytePlus`, e);
    throw e;
  }

  const text = await res.text();
  let parsed: Record<string, unknown> & ArkError;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { error: { code: String(res.status), message: text.slice(0, 500) } };
  }
  // Server-side trail for anything BytePlus rejects (never logs the key).
  if (!res.ok || parsed.error) {
    console.error(`[ugc] ${method} ${path} → HTTP ${res.status}`, JSON.stringify(parsed.error ?? parsed));
  }
  return parsed;
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
  // Voice anchor (mp3 data URL). Order matters: it becomes "@Audio 1" in the prompt.
  audioUrl?: string;
}) {
  const content: Record<string, unknown>[] = [
    { type: "text", text: args.prompt },
    // Verbatim — any copy or re-encode of a Seedream face loses trusted status.
    { type: "image_url", image_url: { url: args.referenceUrl }, role: "reference_image" },
  ];
  if (args.audioUrl) {
    content.push({ type: "audio_url", audio_url: { url: args.audioUrl }, role: "reference_audio" });
  }
  const r = await ark("/contents/generations/tasks", "POST", { model: args.model, content });
  const taskId = (r.id as string | undefined) ?? null;
  return { taskId, error: taskId ? null : (errorOf(r) ?? "Seedance refused the task") };
}

export async function getVideoTask(taskId: string) {
  const r = await ark(`/contents/generations/tasks/${encodeURIComponent(taskId)}`, "GET");
  const status = (r.status as string | undefined) ?? null;
  const videoUrl = (r.content as { video_url?: string } | undefined)?.video_url ?? null;
  return { status, videoUrl, error: errorOf(r) };
}
