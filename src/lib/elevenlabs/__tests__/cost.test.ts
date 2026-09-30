import { describe, it, expect } from "vitest";
import { computeVoiceChangeCost } from "../cost";
import { USD_TO_INR } from "@/lib/pricing";

describe("computeVoiceChangeCost", () => {
  it("charges $0.12 per minute, pro-rated by the second", () => {
    expect(computeVoiceChangeCost(60).usd).toBeCloseTo(0.12, 10);
    expect(computeVoiceChangeCost(8).usd).toBeCloseTo(0.016, 10);
  });

  it("converts to INR with the shared rate", () => {
    const { usd, inr } = computeVoiceChangeCost(48);
    expect(inr).toBeCloseTo(usd * USD_TO_INR, 10);
  });

  it("is zero for a zero-length clip", () => {
    expect(computeVoiceChangeCost(0)).toEqual({ usd: 0, inr: 0 });
  });

  it("multiplies by a custom-rate voice's multiplier", () => {
    expect(computeVoiceChangeCost(60, 2).usd).toBeCloseTo(0.24, 10);
    expect(computeVoiceChangeCost(60).usd).toBeCloseTo(0.12, 10);
  });
});
