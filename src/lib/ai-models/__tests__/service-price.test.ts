import { describe, it, expect } from "vitest";
import {
  dubUsd, lipSyncUsd, voiceChangeEstimateUsd, voiceChangeCharge, transcribeEstimateUsd,
  transcribeCharge, promptFlatUsd, promptCharge,
} from "../service-price";
import type { AiModelPrice } from "../types";

const row = (lines: AiModelPrice["lines"], estimate: Record<string, number> = {}): AiModelPrice => ({
  id: "p", modelId: "m", effectiveFrom: "2026-01-01T00:00:00Z", lines, estimate, sourceUrl: null, note: null,
});

describe("dub and lip sync", () => {
  it("bills a dub per whole second of source", () => {
    const p = row([{ meter: "audio_second", unit_usd: 0.01 }]);
    expect(dubUsd(p, 10.2)).toBeCloseTo(0.11, 10);
  });
  it("bills lip sync per second", () => {
    expect(lipSyncUsd(row([{ meter: "video_second", unit_usd: 0.1 }]), 6)).toBeCloseTo(0.6, 10);
  });
  it("is null when the row has no line for the meter", () => {
    expect(dubUsd(row([{ meter: "video_second", unit_usd: 1 }]), 5)).toBeNull();
  });
});

describe("voice change", () => {
  const p = row([{ meter: "audio_second", unit_usd: 0.002 }, { meter: "provider_credit", unit_usd: 0.000182 }]);
  it("estimates seconds × the voice's multiplier", () => {
    expect(voiceChangeEstimateUsd(p, 30, 2)).toBeCloseTo(0.12, 10);
  });
  it("charges ElevenLabs' reported credits when it sent them", () => {
    const c = voiceChangeCharge(p, { characterCost: 30, seconds: 3, priceMultiplier: 1 })!;
    expect(c.usd).toBeCloseTo(30 * 0.000182, 10);
    expect(c.bill).toEqual({ source: "provider_charge", meters: { provider_credit: 30 } });
  });
  it("falls back to the seconds without a reported cost", () => {
    const c = voiceChangeCharge(p, { characterCost: null, seconds: 30, priceMultiplier: 2 })!;
    expect(c.usd).toBeCloseTo(0.12, 10);
    expect(c.bill.source).toBe("request");
  });
});

describe("transcribe", () => {
  const p = row([{ meter: "provider_credit", unit_usd: 0.000182 }], { provider_credits_per_audio_second: 0.2834 });
  it("estimates the seconds' credits, rounded up to whole credits, at the credit price", () => {
    expect(transcribeEstimateUsd(p, 60)).toBeCloseTo(18 * 0.000182, 10);
  });
  it("is null without the allowance key or credit line", () => {
    expect(transcribeEstimateUsd(row([{ meter: "provider_credit", unit_usd: 1 }]), 60)).toBeNull();
    expect(transcribeEstimateUsd(row([], { provider_credits_per_audio_second: 0.2834 }), 60)).toBeNull();
  });
  it("charges the credits ElevenLabs reported, keeping its fiat header only in raw", () => {
    const c = transcribeCharge(p, { providerCredits: 17, providerUsd: 0.2992, seconds: 60 })!;
    expect(c.usd).toBeCloseTo(17 * 0.000182, 10);
    expect(c.bill).toEqual({
      source: "provider_charge",
      meters: { provider_credit: 17 },
      raw: { fiat_cost_before_overages: 0.2992 },
    });
  });
  it("falls back to the estimated credits without a reported cost", () => {
    const c = transcribeCharge(p, { providerCredits: null, providerUsd: null, seconds: 60 })!;
    expect(c.usd).toBeCloseTo(18 * 0.000182, 10);
    expect(c.bill).toEqual({ source: "request", meters: { provider_credit: 18 } });
  });
});

describe("prompt", () => {
  const p = row([
    { meter: "request", unit_usd: 5 },
    { meter: "input_image", unit_usd: 2.5 },
    { meter: "input_token", unit_usd: 0.00000075 },
    { meter: "cached_input_token", unit_usd: 0.000000075 },
    { meter: "text_output_token", unit_usd: 0.0000045 },
  ]);
  const usage = {
    prompt_tokens: 8606, completion_tokens: 160, total_tokens: 8766,
    prompt_tokens_details: { cached_tokens: 3968 },
  };
  it("prices the flat amount: the base plus each attachment", () => {
    expect(promptFlatUsd(p, 0)).toBe(5);
    expect(promptFlatUsd(p, 3)).toBe(12.5);
  });
  it("is null without the flat lines", () => {
    expect(promptFlatUsd(row([]), 1)).toBeNull();
  });
  it("charges the flat amount and records the real token cost beside it", () => {
    const c = promptCharge(p, usage, 2)!;
    expect(c.usd).toBe(10);
    expect(c.recordedUsd).toBeCloseTo((8606 - 3968) * 0.00000075 + 3968 * 0.000000075 + 160 * 0.0000045, 12);
    expect(c.bill).toEqual({
      source: "provider_usage",
      meters: { input_token: 4638, cached_input_token: 3968, text_output_token: 160 },
    });
  });
  it("records null when a token meter is unpriced, still charging the flat amount", () => {
    const c = promptCharge(row([{ meter: "request", unit_usd: 5 }, { meter: "input_image", unit_usd: 2.5 }]), usage, 0)!;
    expect(c.usd).toBe(5);
    expect(c.recordedUsd).toBeNull();
  });
});
