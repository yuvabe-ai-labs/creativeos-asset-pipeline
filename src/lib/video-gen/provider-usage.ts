// D528 — bill a video from what the provider says it used, not only from its length.
//
// Probed 2026-11-19 (real Omni 1.2 generations, 3s 360p): Google's `usage` block reports input
// tokens (a reference image ~1,100; an edit's source video as many tokens as the output),
// thinking tokens (330–1,530 per call) and the video output. computeVideoCost prices the video
// output alone, so it charged 7–18% below Google's bill. BytePlus reports
// `usage.completion_tokens`, the exact tokens it bills (its minimum included).
//
// Client-safe: the focus view's estimate reads omniEstimateExtrasUsd.
import { USD_TO_INR } from "@/lib/pricing";
import {
  OMNI_11_VIDEO_OUT_PER_M,
  OMNI_12_VIDEO_OUT_PER_M,
  OMNI_OUTPUT_TOKENS_PER_SECOND,
  computeVideoCost,
  pricedVideoModelId,
} from "./cost";

export type OmniUsage = {
  kind: "omni";
  inputTokens: number;
  videoOutputTokens: number;
  textOutputTokens: number;
  thoughtTokens: number;
};
export type SeedanceUsage = { kind: "seedance"; completionTokens: number };
export type VideoProviderUsage = OmniUsage | SeedanceUsage;

// aistudio.google.com/docs/pricing, read 2026-11-19: one input rate for text, image and video,
// and one text output rate that includes thinking, for both 1.1 and 1.2.
const OMNI_INPUT_PER_M = 1.5;
const OMNI_TEXT_AND_THINKING_OUT_PER_M = 9.0;
const OMNI_VIDEO_OUT_PER_M: Record<string, number> = {
  "gemini:gemini-omni-1.1-flash": OMNI_11_VIDEO_OUT_PER_M,
  "gemini:gemini-omni-1.2-flash": OMNI_12_VIDEO_OUT_PER_M,
};

// ref/byteplus-docs/seedance_2.5_PRICING.md: USD per 1M tokens, "input without video" (we never
// send a reference video). The 1080p 28% discount ended 2026-09-17, so 1080p is the list price.
const SEEDANCE_PER_M: Record<string, { standard: number; hd: number }> = {
  "seedance:seedance-2-5": { standard: 10.7, hd: 11.7 },
};

// Estimate allowances, from the same probes: an image costs ~1,100 input tokens, and thinking
// ran up to ~1,530 tokens. Set at the top of what was seen, so the estimate rarely falls short.
const OMNI_TOKENS_PER_INPUT_IMAGE = 1100;
const OMNI_THINKING_ALLOWANCE_TOKENS = 1500;

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Google's Interactions `usage` block, as the four numbers it is billed on. */
export function normalizeOmniUsage(raw: unknown): OmniUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const byModality = Array.isArray(u.output_tokens_by_modality) ? u.output_tokens_by_modality : [];
  const video = byModality.find((m) => (m as { modality?: unknown })?.modality === "video") as
    | { tokens?: unknown }
    | undefined;
  if (!video || !isCount(video.tokens)) return null;
  const totalOut = isCount(u.total_output_tokens) ? u.total_output_tokens : video.tokens;
  return {
    kind: "omni",
    inputTokens: isCount(u.total_input_tokens) ? u.total_input_tokens : 0,
    videoOutputTokens: video.tokens,
    textOutputTokens: Math.max(0, totalOut - video.tokens),
    thoughtTokens: isCount(u.total_thought_tokens) ? u.total_thought_tokens : 0,
  };
}

/** BytePlus's task `usage` block. */
export function normalizeSeedanceUsage(raw: unknown): SeedanceUsage | null {
  const tokens = (raw as { completion_tokens?: unknown } | null | undefined)?.completion_tokens;
  return isCount(tokens) ? { kind: "seedance", completionTokens: tokens } : null;
}

/** A usage that arrived in a webhook body: accepted only in exactly the shape we send. */
export function readVideoUsage(value: unknown): VideoProviderUsage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.kind === "omni") {
    const keys = ["inputTokens", "videoOutputTokens", "textOutputTokens", "thoughtTokens"] as const;
    if (!keys.every((k) => isCount(v[k]))) return null;
    return {
      kind: "omni",
      inputTokens: v.inputTokens as number,
      videoOutputTokens: v.videoOutputTokens as number,
      textOutputTokens: v.textOutputTokens as number,
      thoughtTokens: v.thoughtTokens as number,
    };
  }
  if (v.kind === "seedance" && isCount(v.completionTokens)) {
    return { kind: "seedance", completionTokens: v.completionTokens };
  }
  return null;
}

/** The provider's bill for this generation, or null when the usage doesn't fit the model. */
export function computeVideoCostFromUsage(
  modelId: string,
  usage: VideoProviderUsage,
  resolution: string | undefined,
  at: Date = new Date(),
): { usd: number; inr: number } | null {
  let usd: number;
  if (usage.kind === "omni") {
    const videoOut = OMNI_VIDEO_OUT_PER_M[pricedVideoModelId(modelId, at)];
    if (videoOut === undefined) return null;
    usd =
      (usage.inputTokens * OMNI_INPUT_PER_M +
        usage.videoOutputTokens * videoOut +
        (usage.textOutputTokens + usage.thoughtTokens) * OMNI_TEXT_AND_THINKING_OUT_PER_M) /
      1_000_000;
  } else {
    const rates = SEEDANCE_PER_M[modelId];
    if (!rates) return null;
    const perM = resolution === "1080p" ? rates.hd : rates.standard;
    usd = (usage.completionTokens * perM) / 1_000_000;
  }
  return { usd, inr: usd * USD_TO_INR };
}

/**
 * What an Omni request costs on top of its video output: the images and (for an edit) the
 * source video sent as input, and an allowance for thinking. 0 for every other model.
 */
export function omniEstimateExtrasUsd(
  modelId: string,
  a: { images: number; resolution: string | undefined; editInputSeconds?: number },
): number {
  if (!(modelId in OMNI_VIDEO_OUT_PER_M)) return 0;
  const perSecond = OMNI_OUTPUT_TOKENS_PER_SECOND[a.resolution ?? "720p"] ?? OMNI_OUTPUT_TOKENS_PER_SECOND["720p"];
  const inputTokens = a.images * OMNI_TOKENS_PER_INPUT_IMAGE + (a.editInputSeconds ?? 0) * perSecond;
  return (inputTokens * OMNI_INPUT_PER_M + OMNI_THINKING_ALLOWANCE_TOKENS * OMNI_TEXT_AND_THINKING_OUT_PER_M) / 1_000_000;
}

/**
 * The estimate every reservation and on-screen price uses: the per-second price, plus Omni's
 * input and thinking. null when the model has no price at these params.
 */
export function estimateVideoCostUsd(
  modelId: string,
  durationSeconds: number,
  audioEnabled: boolean,
  resolution: string | undefined,
  a: { images: number; editInputSeconds?: number },
): number | null {
  const base = computeVideoCost(modelId, durationSeconds, audioEnabled, resolution);
  if (!base) return null;
  return base.usd + omniEstimateExtrasUsd(modelId, { images: a.images, resolution, editInputSeconds: a.editInputSeconds });
}
