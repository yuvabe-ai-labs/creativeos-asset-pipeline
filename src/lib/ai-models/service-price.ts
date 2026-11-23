// D535 — the per-run services' estimate and charge, from a price row. Client-safe: the dub, lip
// sync, voice, captions and prompt panels price their estimate with these too.
import { priceMeters } from "./pricing";
import { openAiChatMeters } from "./text-usage";
import type { AiModelPrice, ProviderBill } from "./types";

type Meters = ProviderBill["meters"];

function priced(price: AiModelPrice, meters: Meters): number | null {
  const r = priceMeters(price, meters);
  return r.unpriced.length ? null : r.usd;
}

/** Sarvam bills per whole second of source, one target language. */
export function dubUsd(price: AiModelPrice, seconds: number): number | null {
  return priced(price, { audio_second: Math.ceil(seconds) });
}

export function lipSyncUsd(price: AiModelPrice, seconds: number): number | null {
  return priced(price, { video_second: seconds });
}

/** ElevenLabs bills by audio length, times the voice's custom-rate multiplier. */
export function voiceChangeEstimateUsd(price: AiModelPrice, seconds: number, priceMultiplier: number): number | null {
  return priced(price, { audio_second: seconds * priceMultiplier });
}

export function voiceChangeCharge(
  price: AiModelPrice,
  a: { characterCost: number | null; seconds: number; priceMultiplier: number },
): { usd: number; bill: ProviderBill } | null {
  if (a.characterCost !== null && a.characterCost > 0) {
    const usd = priced(price, { provider_credit: a.characterCost });
    if (usd !== null) return { usd, bill: { source: "provider_charge", meters: { provider_credit: a.characterCost } } };
  }
  const meters: Meters = { audio_second: a.seconds * a.priceMultiplier };
  const usd = priced(price, meters);
  return usd === null ? null : { usd, bill: { source: "request", meters } };
}

/** The credits a transcription of this length is expected to use: the row's allowance, whole credits. */
function transcribeEstimateCredits(price: AiModelPrice, seconds: number): number | null {
  const perSecond = price.estimate.provider_credits_per_audio_second;
  return perSecond === undefined ? null : Math.ceil(seconds * perSecond);
}

/** Scribe's allowance in credits per second, priced at the plan's credit price. */
export function transcribeEstimateUsd(price: AiModelPrice, seconds: number): number | null {
  const credits = transcribeEstimateCredits(price, seconds);
  return credits === null ? null : priced(price, { provider_credit: credits });
}

/**
 * A transcription of several files: ElevenLabs bills each file and rounds each one up, so the
 * estimate is the sum of each file's whole credits. The captions button and the route both use it.
 */
export function transcribeFilesEstimateUsd(price: AiModelPrice, filesSeconds: readonly number[]): number | null {
  let credits = 0;
  for (const seconds of filesSeconds) {
    const c = transcribeEstimateCredits(price, seconds);
    if (c === null) return null;
    credits += c;
  }
  return priced(price, { provider_credit: credits });
}

/** Charged from the credits ElevenLabs reports; its fiat header is kept in `raw` only. */
export function transcribeCharge(
  price: AiModelPrice,
  a: { providerCredits: number | null; providerUsd: number | null; seconds: number },
): { usd: number; bill: ProviderBill } | null {
  if (a.providerCredits !== null && a.providerCredits > 0) {
    const usd = priced(price, { provider_credit: a.providerCredits });
    if (usd !== null) {
      const bill: ProviderBill = { source: "provider_charge", meters: { provider_credit: a.providerCredits } };
      if (a.providerUsd !== null) bill.raw = { fiat_cost_before_overages: a.providerUsd };
      return { usd, bill };
    }
  }
  const credits = transcribeEstimateCredits(price, a.seconds);
  if (credits === null) return null;
  const meters: Meters = { provider_credit: credits };
  const usd = priced(price, meters);
  return usd === null ? null : { usd, bill: { source: "request", meters } };
}

/**
 * D536 — a prompt run's flat price in USD, read from its row: a `request` line plus one
 * `input_image` line per attachment. On a prompt row the input_image line is a flat per-attachment
 * price, not a token meter.
 */
export function promptFlatUsd(price: AiModelPrice, attachmentCount: number): number | null {
  return priced(price, { request: 1, input_image: attachmentCount });
}

/** The flat price in credits: USD x 1000 to 6 decimals (no float noise), deliberately not rounded to 5 like usdToFinalCredits. */
export function promptFlatCredits(price: AiModelPrice, attachmentCount: number): number | null {
  const usd = promptFlatUsd(price, attachmentCount);
  return usd === null ? null : Math.round(usd * 1e9) / 1e6;
}

type PromptUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
};

/**
 * D536 — a prompt run is charged its flat price; the token cost OpenAI billed is returned beside it
 * (`recordedUsd`, null when a token meter is unpriced) to be recorded, never charged. `usd` is the
 * flat USD; callers convert it with promptFlatCredits (x1000), never usdToFinalCredits.
 */
export function promptCharge(
  price: AiModelPrice,
  usage: PromptUsage,
  attachmentCount: number,
): { usd: number; recordedUsd: number | null; bill: ProviderBill } | null {
  const usd = promptFlatUsd(price, attachmentCount);
  if (usd === null) return null;
  const meters: Meters = openAiChatMeters(usage);
  return { usd, recordedUsd: priced(price, meters), bill: { source: "provider_usage", meters } };
}

/**
 * D536 — what a finished prompt run records: the flat credits it is charged (reserved and settled
 * alike), the token cost OpenAI billed (null when there is no usage or a token meter is unpriced),
 * and the bill. With no usage the bill is the request itself. Null when the row has no flat price.
 */
export function promptRunRecord(
  price: AiModelPrice,
  usage: PromptUsage | null,
  attachmentCount: number,
): { credits: number; costUsd: number | null; bill: ProviderBill } | null {
  const credits = promptFlatCredits(price, attachmentCount);
  if (credits === null) return null;
  const charge = usage ? promptCharge(price, usage, attachmentCount) : null;
  if (usage && charge) return { credits, costUsd: charge.recordedUsd, bill: { ...charge.bill, raw: { ...usage } } };
  return { credits, costUsd: null, bill: { source: "request", meters: { request: 1, input_image: attachmentCount } } };
}
