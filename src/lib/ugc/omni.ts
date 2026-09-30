import "server-only";
// UGC bench — Gemini Omni 1.1 Flash. The request shape mirrors the product provider
// (src/lib/video-gen/providers/gemini-omni.ts), where each of these facts was verified against
// the live API: images first and the text part LAST (the @ImageN numbers count that array from
// 1), `store: true` is required by `delivery: "uri"`, and `video_config` accepts `task` and
// nothing else. Probed again for this bench on 2026-09-23: a Seedream face is accepted as a
// plain reference, it answers synchronously (~26s), and returns h264 + AAC.
import { OMNI_MODEL, type BenchSettings } from "./constants";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Product uses 540s; a bench clip is 3–10s, so a shorter ceiling surfaces a hang sooner.
const REQUEST_TIMEOUT_MS = 300_000;

export function apiKey(): string {
  const key = process.env.GOOGLE_GENAI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENAI_API_KEY is not set — add it to .env.local");
  return key;
}

export function buildOmniPrompt(script: string): string {
  return (
    "@Image 1 is a reference image.\n\n" +
    `${script.trim()}\n\n` +
    "Use the person in @Image 1 as the creator in the video."
  );
}

export function buildOmniBody(args: {
  imageData: string;
  mimeType: string;
  script: string;
  settings: BenchSettings;
}): Record<string, unknown> {
  return {
    model: OMNI_MODEL,
    input: [
      { type: "image", data: args.imageData, mime_type: args.mimeType },
      { type: "text", text: buildOmniPrompt(args.script) },
    ],
    generation_config: { video_config: { task: "reference_to_video" } },
    response_format: {
      type: "video",
      resolution: args.settings.resolution,
      aspect_ratio: args.settings.ratio,
      delivery: "uri",
      duration: `${args.settings.duration}s`,
    },
    store: true,
    background: false,
    stream: false,
  };
}

type Interaction = {
  id?: string;
  status?: string;
  steps?: { type?: string; content?: { type?: string; uri?: string }[] }[];
  error?: { message?: string };
};

export function videoUriOf(interaction: Interaction): string | null {
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const c of step.content ?? []) if (c.type === "video" && c.uri) return c.uri;
  }
  return null;
}

export async function generateOmniVideo(args: {
  faceUrl: string;
  script: string;
  settings: BenchSettings;
}): Promise<{ videoUri: string | null; error: string | null }> {
  let imageData: string;
  let mimeType: string;
  if (args.faceUrl.startsWith("data:")) {
    // An uploaded photo arrives already inline — no fetch, and nothing of it is stored.
    const match = args.faceUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) return { videoUri: null, error: "The uploaded image could not be read" };
    mimeType = match[1];
    imageData = match[2];
  } else {
    const img = await fetch(args.faceUrl, { cache: "no-store" });
    if (!img.ok) {
      return { videoUri: null, error: `Could not read the face image (HTTP ${img.status})` };
    }
    mimeType = (img.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    imageData = Buffer.from(await img.arrayBuffer()).toString("base64");
  }

  const res = await fetch(`${API_BASE}/interactions`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(buildOmniBody({ imageData, mimeType, script: args.script, settings: args.settings })),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[ugc] omni POST /interactions → HTTP ${res.status}`, text.slice(0, 600));
    return { videoUri: null, error: `Omni refused the request (HTTP ${res.status}): ${text.slice(0, 300)}` };
  }

  const interaction = JSON.parse(text) as Interaction;
  if (interaction.status === "failed") {
    const message = interaction.error?.message ?? "unknown error";
    console.error("[ugc] omni generation failed", message);
    return { videoUri: null, error: `Omni generation failed: ${message}` };
  }

  const videoUri = videoUriOf(interaction);
  return { videoUri, error: videoUri ? null : "Omni completed but returned no video" };
}
