import "server-only";
import { logger } from "@trigger.dev/sdk/v3";
import type { VideoGenInput, VideoGenResult, VideoGenModelSpec } from "../types";
import { kling30Params, klingO1Params, kling30OmniParams } from "../params/kling";

const KLING_API_BASE = "https://api-singapore.klingai.com";
const POLL_INTERVAL_MS = 5_000;

function getApiKey(): string {
  const key = process.env.KLING_API_KEY;
  if (!key) throw new Error("Missing KLING_API_KEY");
  return key;
}

type KlingContentInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceUrls?: string[];
};

export function buildKlingContents(
  input: KlingContentInput,
): Array<Record<string, unknown>> {
  const contents: Array<Record<string, unknown>> = [
    { type: "prompt", text: input.prompt },
  ];
  if (input.startFrameUrl) {
    contents.push({ type: "first_frame", url: input.startFrameUrl });
  }
  if (input.endFrameUrl) {
    contents.push({ type: "last_frame", url: input.endFrameUrl });
  }
  // `id` is how the prompt addresses an image (@image_1). Only the omni endpoint accepts
  // refer_image — generateWithKling gates this per model, so callers can pass references
  // freely and the wrong endpoint simply never sees them.
  (input.referenceUrls ?? []).forEach((url, i) => {
    contents.push({ type: "refer_image", url, id: `image_${i + 1}` });
  });
  return contents;
}

const KLING_OPTIONS = { watermark_info: { enabled: false } };

// Kling's field is snake_case `negative_prompt` (Veo's SDK uses camelCase `negativePrompt`).
// Omitted entirely when blank so an emptied box sends no negative at all.
function negativePromptSetting(params: Record<string, unknown>): Record<string, unknown> {
  const negativePrompt = String(params.negative_prompt ?? "").trim();
  return negativePrompt ? { negative_prompt: negativePrompt } : {};
}

export function build3_0Settings(
  params: Record<string, unknown>,
): Record<string, unknown> {
  return {
    // Off by default, matching the param spec (4cee50d). The previous `?? true` fallback
    // contradicted that spec on any path where the param was absent.
    multi_shot: Boolean(params.multi_shot ?? false),
    audio: String(params.audio ?? "off"),
    resolution: String(params.resolution ?? "720p"),
    duration: Number(params.duration ?? 5),
    ...negativePromptSetting(params),
  };
}

// O1 rejects every duration but 5 or 10 unless the request carries a `refer_image`:
//   400 {"code":1201,"message":"Duration only supports 5 or 10 seconds when no refer_image is provided"}
// D100 made buildKlingContents emit refer_image, so the wider range is now reachable in principle
// — but klingO1Params still offers only 5/10 (a static spec cannot narrow itself back when the
// last reference is removed), so nothing upstream can ask for another value and the clamp holds.
//
// NOTE: the published /omni-video/kling-3.0-omni docs enumerate duration 3–15 with no such
// caveat. That page documents a DIFFERENT path than the one we call (/omni-video/kling-o1), and
// the live endpoint's own validator is what produced the message above — so runtime behaviour
// wins over the doc table here. Do not widen this list on the strength of that page alone;
// widening it needs either an O1-specific doc or a real request that succeeds.
//
// klingO1Params no longer offers other values, but a node saved before that change still holds
// one and nothing re-validates persisted params on load, so clamp here too rather than ship a
// guaranteed 400. Same shape as VALID_DURATIONS in veo.ts.
const O1_VALID_DURATIONS = [5, 10];

// `original` retains a reference video's own soundtrack, and we never send a video — so a node
// saved while it was still the only audio-on option asked for sound and would now get silence.
// Carry that intent over to `native` (the enum value that actually produces audio here) rather
// than dropping it to "off". Both bill identically for O1, so this cannot change a price.
function omniAudio(value: unknown): string {
  const audio = String(value ?? "off");
  if (audio === "original") return "native";
  return audio === "native" ? "native" : "off";
}

// OM8: `aspect_ratio` is REQUIRED when the request carries no first frame and no reference video,
// and rejected/ignored otherwise (Kling derives the ratio from the first frame when there is one).
// Sent only on the references-only path, so a normal start-frame generation is byte-identical to
// what it sent before D101.
const OMNI_VALID_ASPECT_RATIOS = ["16:9", "9:16", "1:1"];

function omniAspectRatioSetting(
  params: Record<string, unknown>,
  hasStartFrame: boolean,
): Record<string, unknown> {
  if (hasStartFrame) return {};
  const ratio = String(params.aspect_ratio ?? "16:9");
  return { aspect_ratio: OMNI_VALID_ASPECT_RATIOS.includes(ratio) ? ratio : "16:9" };
}

/**
 * The settings body shared by every /omni-video endpoint.
 *
 * Extracted when Kling 3.0 Omni was added: both endpoints take the same envelope, the same
 * aspect-ratio rule (OM8) and the same audio coercion, and differ ONLY in which durations they
 * accept. The duration policy is therefore the parameter — a second copy of this body would be
 * four shared rules maintained twice, and the one that drifts silently is `multi_shot`.
 *
 * The `omni`-prefixed helpers above were named `o1*` when O1 was the only caller. They describe
 * the endpoint family, not O1's model weights, so leaving the old names would read as 3.0 Omni
 * borrowing O1's quirks rather than sharing the family's contract.
 */
function buildOmniSettings(
  params: Record<string, unknown>,
  ctx: { hasStartFrame: boolean },
  resolveDuration: (requested: number) => number,
): Record<string, unknown> {
  return {
    ...omniAspectRatioSetting(params, ctx.hasStartFrame),
    // Absent → false, matching multiShotParam's declared default. Kling's own server-side
    // default is TRUE, so omitting this field entirely (as this builder used to) silently
    // opted every clip into multi-shot cuts — the exact thing params/kling.ts calls out as
    // fighting the single continuous moment a product clip wants.
    multi_shot: Boolean(params.multi_shot ?? false),
    audio: omniAudio(params.audio),
    resolution: String(params.resolution ?? "720p"),
    duration: resolveDuration(Number(params.duration ?? 5)),
    ...negativePromptSetting(params),
  };
}

// `ctx` defaults to hasStartFrame: true — the shape every caller sent before D101, and the one
// that omits aspect_ratio. A caller that genuinely has no start frame must say so.
export function buildO1Settings(
  params: Record<string, unknown>,
  ctx: { hasStartFrame: boolean } = { hasStartFrame: true },
): Record<string, unknown> {
  return buildOmniSettings(params, ctx, (requested) =>
    O1_VALID_DURATIONS.includes(requested) ? requested : 5,
  );
}

// 3.0 Omni's documented range is a CONTINUOUS 3–15, and O1's 5/10 clamp deliberately does not
// apply: that clamp exists because O1's live validator rejected 3/4/6-second requests (see
// O1_VALID_DURATIONS above), which is runtime evidence about that endpoint alone. Applying it
// here would silently rewrite the multishot lane's duration — which is the sum of the operator's
// own cut ladder, any integer in range — down to 5, and Kling rejects a shot list whose seconds
// no longer sum to `duration`.
const OMNI_30_MIN_DURATION = 3;
const OMNI_30_MAX_DURATION = 15;

export function build30OmniSettings(
  params: Record<string, unknown>,
  ctx: { hasStartFrame: boolean } = { hasStartFrame: true },
): Record<string, unknown> {
  return buildOmniSettings(params, ctx, (requested) =>
    Math.min(OMNI_30_MAX_DURATION, Math.max(OMNI_30_MIN_DURATION, Math.round(requested))),
  );
}

type KlingCreateResponse = {
  code: number;
  message: string;
  data: { id: string; status: string };
};

async function createKlingTask(
  endpointPath: string,
  contents: Array<Record<string, unknown>>,
  settings: Record<string, unknown>,
): Promise<string> {
  const apiKey = getApiKey();
  const res = await fetch(`${KLING_API_BASE}${endpointPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ contents, settings, options: KLING_OPTIONS }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kling create failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as KlingCreateResponse;
  if (json.code !== 0) throw new Error(`Kling create rejected: ${json.message}`);
  return json.data.id;
}

type KlingTaskOutput = { type: string; url: string; duration?: string };
type KlingTask = {
  id: string;
  status: "submitted" | "processing" | "succeeded" | "failed";
  message?: string;
  outputs?: KlingTaskOutput[];
};
type KlingQueryResponse = { code: number; message: string; data: KlingTask[] };

async function pollKlingTask(taskId: string): Promise<VideoGenResult> {
  const apiKey = getApiKey();
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(`${KLING_API_BASE}/tasks?task_ids=${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Kling poll failed (${res.status})`);
    const json = (await res.json()) as KlingQueryResponse;
    const kTask = json.data[0];

    logger.info("Kling task status", { taskId, status: kTask?.status });

    if (kTask?.status === "succeeded") {
      const video = kTask.outputs?.find((o) => o.type === "video");
      if (!video) throw new Error("Kling task succeeded but returned no video output");
      return {
        videoUrl: video.url,
        durationSeconds: Number(video.duration ?? 0),
      };
    }
    if (kTask?.status === "failed") {
      throw new Error(`Kling generation failed: ${kTask.message ?? "unknown error"}`);
    }
  }
}

type KlingEndpointConfig = {
  endpointPath: string;
  /**
   * Only the omni endpoint accepts `refer_image`. Kling 3.0's content enum is
   * prompt / first_frame / last_frame / element, so references are dropped there rather than
   * sent as an unsupported type.
   */
  supportsReferences: boolean;
  /**
   * K1 — /image-to-video/kling-3.0 rejects a request with no `first_frame`; there is nothing to
   * animate. The omni endpoint does not (OM1), so O1 sets this false and leans on the weaker
   * "start frame OR a reference" guard below.
   */
  requiresStartFrame: boolean;
};

type KlingSettingsBuilder = (
  params: Record<string, unknown>,
  ctx: { hasStartFrame: boolean },
) => Record<string, unknown>;

async function generateWithKling(
  config: KlingEndpointConfig,
  buildSettings: KlingSettingsBuilder,
  input: VideoGenInput,
): Promise<VideoGenResult> {
  const referenceUrls = config.supportsReferences ? (input.referenceUrls ?? []) : [];

  if (config.requiresStartFrame && !input.startFrameUrl) {
    throw new Error("Kling image-to-video requires a start frame image");
  }
  // D101 — the omni endpoint animates from references alone, but not from nothing: with neither a
  // start frame nor a reference there is no subject. Mirrors the client rule in client-models.ts
  // so a caller that bypasses the UI gets a named error instead of a Kling 400 minutes later.
  if (!input.startFrameUrl && referenceUrls.length === 0) {
    throw new Error("Kling needs a start frame or at least one reference image");
  }
  // OM7 — last-frame-only is unsupported. Unreachable while a start frame was mandatory.
  if (!input.startFrameUrl && input.endFrameUrl) {
    throw new Error("Kling cannot use an end frame without a start frame");
  }

  const contents = buildKlingContents({
    prompt: input.prompt,
    startFrameUrl: input.startFrameUrl,
    endFrameUrl: input.endFrameUrl,
    referenceUrls,
  });
  const settings = buildSettings(input.params, {
    hasStartFrame: Boolean(input.startFrameUrl),
  });
  const taskId = await createKlingTask(config.endpointPath, contents, settings);
  return pollKlingTask(taskId);
}

// D99: 3.0 and O1 cannot share one descriptor. Their reference mechanisms differ in kind —
// 3.0's `element` is a pre-registered library resource addressed by `element_id`, while O1's
// `refer_image` is a plain inline URL. One shared shape forced both to the lower bound.
const KLING_30_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 0,
} as const;

// D100: 7-image omni budget less both frames, conservatively — the docs do not say whether
// first_frame/last_frame count toward the 7. Must match the client copy in client-models.ts,
// since the API route caps referenceUrls against this value.
const KLING_O1_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 5,
} as const;

export const kling30: VideoGenModelSpec = {
  id: "kling:kling-3-0",
  provider: "kling",
  label: "Kling 3.0",
  providerLabel: "Kling",
  maxDurationSeconds: 15,
  imageInputs: KLING_30_IMAGE_INPUTS,
  params: kling30Params,
  generate: (input) =>
    generateWithKling(
      {
        endpointPath: "/image-to-video/kling-3.0",
        supportsReferences: false,
        requiresStartFrame: true,
      },
      build3_0Settings,
      input,
    ),
};

export const klingO1: VideoGenModelSpec = {
  id: "kling:kling-o1",
  provider: "kling",
  label: "Kling O1",
  providerLabel: "Kling",
  maxDurationSeconds: 10,
  imageInputs: KLING_O1_IMAGE_INPUTS,
  params: klingO1Params,
  generate: (input) =>
    generateWithKling(
      {
        endpointPath: "/omni-video/kling-o1",
        supportsReferences: true,
        requiresStartFrame: false,
      },
      buildO1Settings,
      input,
    ),
};

// Kling's flagship, and the second model that cuts between shots natively (D235/D236). A new
// model entry on transport that already exists: the {contents, settings, options} envelope
// generateWithKling sends is exactly what /omni-video/kling-3.0-omni documents, and
// buildKlingContents already emits `refer_image` entries with the `image_N` ids the prompt's
// @image_N handles bind to.
//
// Shares O1's image-input shape: same 7-image omni budget, same undocumented question about
// whether the frames count toward it, so the same conservative 5.
export const kling30Omni: VideoGenModelSpec = {
  id: "kling:kling-3-0-omni",
  provider: "kling",
  label: "Kling 3.0 Omni",
  providerLabel: "Kling",
  maxDurationSeconds: 15,
  imageInputs: KLING_O1_IMAGE_INPUTS,
  params: kling30OmniParams,
  generate: (input) =>
    generateWithKling(
      {
        endpointPath: "/omni-video/kling-3.0-omni",
        supportsReferences: true,
        requiresStartFrame: false,
      },
      build30OmniSettings,
      input,
    ),
};
