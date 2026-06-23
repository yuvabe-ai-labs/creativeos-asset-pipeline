import "server-only";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { soraParams } from "../params/sora";

const OPENAI_API_BASE = "https://api.openai.com/v1";
const SORA_MODEL = "sora-2";
const POLL_INTERVAL_MS = 10_000;

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");
  return key;
}

type SoraJob = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  error?: string;
};

async function generateWithSora(input: VideoGenInput): Promise<VideoGenResult> {
  const apiKey = getApiKey();
  const seconds = String(input.params.seconds ?? "4");
  const size = String(input.params.size ?? "1280x720");

  const body: Record<string, unknown> = {
    model: SORA_MODEL,
    prompt: input.prompt,
    seconds,
    size,
  };

  if (input.startFrameUrl) {
    body.input_reference = { image_url: input.startFrameUrl };
  }

  const createRes = await fetch(`${OPENAI_API_BASE}/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Sora create failed (${createRes.status}): ${text}`);
  }

  const job = (await createRes.json()) as SoraJob;
  let { id: videoId, status } = job;

  while (status !== "completed" && status !== "failed") {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${OPENAI_API_BASE}/videos/${videoId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) throw new Error(`Sora poll failed (${pollRes.status})`);
    const data = (await pollRes.json()) as SoraJob;
    status = data.status;
    if (data.error) throw new Error(`Sora failed: ${data.error}`);
  }

  if (status === "failed") {
    throw new Error("Sora video generation failed");
  }

  // complete.ts downloads this URL with Authorization: Bearer header
  return {
    videoUrl: `${OPENAI_API_BASE}/videos/${videoId}/content`,
    durationSeconds: Number(seconds),
  };
}

export const soraFast: VideoGenModelSpec = {
  id: "openai:sora-2",
  provider: "openai",
  label: "Sora 2",
  providerLabel: "OpenAI",
  maxDurationSeconds: 12,
  imageInputs: { startFrame: true, endFrame: false, maxReferenceImages: 0 },
  params: soraParams,
  generate: generateWithSora,
};
