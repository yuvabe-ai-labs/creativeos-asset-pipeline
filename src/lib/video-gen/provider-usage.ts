// D528 — bill a video from what the provider says it used, not only from its length.
//
// Probed 2026-11-19 (real Omni 1.2 generations, 3s 360p): Google's `usage` block reports input
// tokens (a reference image ~1,100; an edit's source video as many tokens as the output),
// thinking tokens (330–1,530 per call) and the video output. Only the video output was priced, so it charged 7–18% below Google's bill. BytePlus reports
// `usage.completion_tokens`, the exact tokens it bills (its minimum included).

export type OmniUsage = {
  kind: "omni";
  inputTokens: number;
  videoOutputTokens: number;
  textOutputTokens: number;
  thoughtTokens: number;
};
export type SeedanceUsage = { kind: "seedance"; completionTokens: number };
export type VideoProviderUsage = OmniUsage | SeedanceUsage;

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
