// D534 — a video run's estimate and charge, from its model's price row. Client-safe.
import type { VideoProviderUsage } from "@/lib/video-gen/provider-usage";
import { lineFor, priceMeters, type MeterQuantities, type PriceDims } from "./pricing";
import type { AiModelPrice } from "./types";

export function videoDims(resolution: string | undefined, audioEnabled: boolean): PriceDims {
  return { resolution: resolution ?? "720p", audio: audioEnabled };
}

/** The per-second price: the estimate's base, and the charge when no usage came back. */
export function videoSecondsUsd(
  price: AiModelPrice,
  durationSeconds: number,
  audioEnabled: boolean,
  resolution: string | undefined,
): number | null {
  const line = lineFor(price, "video_second", videoDims(resolution, audioEnabled));
  return line ? durationSeconds * line.unit_usd : null;
}

/** What the run is reserved at: the seconds, plus the row's allowances for input and thinking. */
export function videoEstimateUsd(
  price: AiModelPrice,
  a: { durationSeconds: number; audioEnabled: boolean; resolution: string | undefined; images: number; editInputSeconds?: number },
): number | null {
  const base = videoSecondsUsd(price, a.durationSeconds, a.audioEnabled, a.resolution);
  if (base === null) return null;
  const e = price.estimate;
  const perEditSecond =
    e[`edit_input_tokens_per_second_${a.resolution ?? "720p"}`] ?? e.edit_input_tokens_per_second_720p ?? 0;
  const extras = priceMeters(
    price,
    {
      input_token: a.images * (e.input_tokens_per_image ?? 0) + (a.editInputSeconds ?? 0) * perEditSecond,
      thought_token: e.thought_tokens ?? 0,
    },
    videoDims(a.resolution, a.audioEnabled),
  );
  return base + extras.usd;
}

export function videoUsageMeters(usage: VideoProviderUsage): MeterQuantities {
  return usage.kind === "omni"
    ? {
        input_token: usage.inputTokens,
        video_output_token: usage.videoOutputTokens,
        text_output_token: usage.textOutputTokens,
        thought_token: usage.thoughtTokens,
      }
    : { video_output_token: usage.completionTokens };
}

export type VideoCharge = { usd: number; source: "provider_usage" | "request"; meters: MeterQuantities };

/** What the run costs: the provider's usage when every meter of it is priced, else the seconds. */
export function videoChargeUsd(
  price: AiModelPrice,
  a: { usage: VideoProviderUsage | null; durationSeconds: number; audioEnabled: boolean; resolution: string | undefined },
): VideoCharge | null {
  if (a.usage) {
    const meters = videoUsageMeters(a.usage);
    const priced = priceMeters(price, meters, videoDims(a.resolution, a.audioEnabled));
    if (priced.unpriced.length === 0) return { usd: priced.usd, source: "provider_usage", meters };
  }
  const usd = videoSecondsUsd(price, a.durationSeconds, a.audioEnabled, a.resolution);
  return usd === null ? null : { usd, source: "request", meters: { video_second: a.durationSeconds } };
}
