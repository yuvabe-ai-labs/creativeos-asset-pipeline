import "server-only";
import { logger } from "@trigger.dev/sdk/v3";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { seedanceParams } from "../params/seedance";

const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

// Same cadence as pollKlingTask (providers/kling.ts) and the same absence of a client-side
// timeout — an operator watching two async providers should not meet two different timeout
// behaviours. Seedance's own `execution_expires_after` (vendor default 48h) is what eventually
// bounds a stuck task; it surfaces here as a terminal `failed`/`cancelled` status, not as a poll
// loop giving up on its own.
const POLL_INTERVAL_MS = 5_000;

// The vendor's model string lives HERE and nowhere else. Its dated suffix changes when BytePlus
// revises the model; our own id (`seedance:seedance-2-5`, client-models.ts) is what persists on
// nodes and version rows. Keeping them separate makes a vendor bump a one-line edit rather than a
// migration of every saved node.
const VENDOR_MODEL = "dreamina-seedance-2-5-260628";

function getApiKey(): string {
  const key = process.env.BYTEPLUS_API_KEY;
  // Named error, thrown up front. The alternative is a 401 surfacing from inside the Trigger task
  // minutes after the click, which is how a missing Kling key used to present.
  if (!key) throw new Error("BYTEPLUS_API_KEY is not set — Seedance cannot generate.");
  return key;
}

type SeedanceContent = Record<string, unknown>;

/**
 * Frames and references are MUTUALLY EXCLUSIVE on this endpoint, so this returns one or the
 * other and never both. The client rules (client-models.ts) disable the unavailable input, and
 * this is the backstop for a caller that bypassed them.
 */
function buildSeedanceContent(input: VideoGenInput, maxRefs: number): SeedanceContent[] {
  const content: SeedanceContent[] = [{ type: "text", text: input.prompt }];

  if (input.startFrameUrl) {
    content.push({ type: "image_url", image_url: { url: input.startFrameUrl }, role: "first_frame" });
    if (input.endFrameUrl) {
      content.push({ type: "image_url", image_url: { url: input.endFrameUrl }, role: "last_frame" });
    }
    return content;
  }

  for (const url of (input.referenceUrls ?? []).slice(0, maxRefs)) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  return content;
}

function buildSeedanceBody(input: VideoGenInput, maxRefs: number): Record<string, unknown> {
  const duration = Number(input.params.duration ?? 5);
  return {
    model: VENDOR_MODEL,
    content: buildSeedanceContent(input, maxRefs),
    resolution: String(input.params.resolution ?? "720p"),
    // `ratio` is omitted when a first frame is present: the vendor derives the ratio from that
    // image and rejects a conflicting value. Sent otherwise, because a references-only or
    // text-only request has no frame to derive from, and `adaptive` there is a coin toss on
    // whether a reel comes back vertical.
    ...(input.startFrameUrl ? {} : { ratio: String(input.params.ratio ?? "9:16") }),
    // Always explicit. The vendor default is -1 ("model picks"), which on the multishot lane
    // would silently disagree with the shot timestamps already written into the prompt.
    duration: Number.isFinite(duration) ? Math.min(30, Math.max(4, Math.round(duration))) : 5,
  };
}

async function createSeedanceTask(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${ARK_BASE}/contents/generations/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Read response body as text first to avoid parse errors swallowing the real HTTP status.
  // A gateway timeout HTML page or plaintext 5xx error won't parse as JSON; reading text
  // ensures the actual status and body surface to the operator instead of a parse error.
  // This pattern follows createKlingTask (providers/kling.ts).
  const text = await res.text();

  if (!res.ok) {
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(`Seedance task creation failed (${res.status}): ${truncated}`);
  }

  let json: { id?: string; error?: { message?: string } };
  try {
    json = JSON.parse(text);
  } catch {
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(`Seedance task creation failed (${res.status}): ${truncated}`);
  }

  if (!json.id) {
    // Seedance's late-arriving errors are the real diagnosis. Preserve the vendor's own
    // error message if present, rather than burying it behind a generic string.
    throw new Error(`Seedance task creation failed: ${json.error?.message ?? res.statusText}`);
  }

  return json.id;
}

type SeedanceTask = {
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  content?: { video_url?: string };
  // Top-level on the retrieve response (ref/byteplus-docs/Retrieve a video generation task.md),
  // not nested under `content` — the vendor doc's own response-parameters list has `duration`
  // as a sibling of `content`, not a field inside it.
  duration?: number;
  error?: { code?: string; message?: string } | null;
};

// `cancelled` is terminal. Treating it as pending would spin the loop until timeout on a task
// that is never coming back.
async function pollSeedanceTask(taskId: string): Promise<VideoGenResult> {
  const apiKey = getApiKey();
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(`${ARK_BASE}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Seedance poll failed (${res.status})`);
    const task = (await res.json()) as SeedanceTask;

    logger.info("Seedance task status", { taskId, status: task.status });

    if (task.status === "succeeded") {
      const videoUrl = task.content?.video_url;
      if (!videoUrl) throw new Error("Seedance task succeeded but returned no video output");
      return { videoUrl, durationSeconds: Number(task.duration ?? 0) };
    }
    // For some Seedance 2.5 task types the vendor returns `error` only after the queued task is
    // consumed (ref/byteplus-docs/Retrieve a video generation task.md), so `error.message` here
    // is the real diagnosis, not boilerplate — surfaced verbatim rather than a generic
    // "generation failed" that would throw away that detail.
    if (task.status === "failed") {
      throw new Error(task.error?.message ?? "Seedance generation failed with no error detail");
    }
    if (task.status === "cancelled") {
      throw new Error("Seedance generation was cancelled");
    }
  }
}

// Server-side twin of the client shape in client-models.ts (SEEDANCE_IMAGE_INPUTS). Same D99
// split as Kling: this module is server-only and client-models.ts (safe for React) cannot import
// it, so the shape is declared once on each side. maxReferenceImages MUST match the client copy —
// the API route caps referenceUrls against the client value while generate() below is built from
// this one, so a drift here silently truncates references on a paid generation.
const SEEDANCE_IMAGE_INPUTS_SERVER = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 10,
} as const;

export const seedance25: VideoGenModelSpec = {
  id: "seedance:seedance-2-5",
  provider: "seedance",
  label: "Seedance 2.5",
  providerLabel: "Seedance",
  maxDurationSeconds: 30,
  imageInputs: SEEDANCE_IMAGE_INPUTS_SERVER,
  params: seedanceParams,
  generate: (input) =>
    createSeedanceTask(buildSeedanceBody(input, SEEDANCE_IMAGE_INPUTS_SERVER.maxReferenceImages))
      .then(pollSeedanceTask),
};
