import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai-models/catalog", async () => {
  const { seededCatalog } = await import("@/lib/ai-models/test-prices");
  return { getAiCatalog: async () => seededCatalog() };
});

import { usdToFinalCredits } from "@/lib/credits/units";
import { transcribeEstimateUsd } from "@/lib/ai-models/service-price";
import { seededPrice } from "@/lib/ai-models/test-prices";
import { TRANSCRIBE_MODEL_ID } from "@/lib/ai-models/service-models";
import { priceForGeneration } from "@/lib/ai-models/run-price";
import { settleTranscribe } from "../settle";

const row = seededPrice(TRANSCRIBE_MODEL_ID);
const generation = { id: "g1", model_used: TRANSCRIBE_MODEL_ID, created_at: "2026-11-22T00:00:00Z", org_id: "o1", model_price_id: row.id };

describe("settleTranscribe (D535)", () => {
  it("charges the credits ElevenLabs reported, at the plan's credit price; the fiat header goes in raw", async () => {
    const r = await settleTranscribe(
      { generation, secondsDone: 60, providerCredits: 17, providerUsd: 0.2992 },
      { priceFor: async () => row, reservedFor: async () => 77 },
    );
    expect(r.usd).toBeCloseTo(17 * 0.000182, 10);
    expect(r.credits).toBe(usdToFinalCredits(17 * 0.000182));
    expect(r.bill).toEqual({ source: "provider_charge", meters: { provider_credit: 17 }, raw: { fiat_cost_before_overages: 0.2992 } });
  });

  it("falls back to the seconds allowance when no credits were reported", async () => {
    const r = await settleTranscribe(
      { generation, secondsDone: 60, providerCredits: null, providerUsd: null },
      { priceFor: async () => row, reservedFor: async () => 77 },
    );
    expect(r.usd).toBe(transcribeEstimateUsd(row, 60));
    expect(r.bill).toEqual({ source: "request", meters: { provider_credit: Math.ceil(60 * 0.2834) } });
  });

  it("settles at the reserved amount with no cost when there is no row", async () => {
    const reservedFor = vi.fn(async () => 77);
    const r = await settleTranscribe({ generation, secondsDone: 60, providerCredits: 17, providerUsd: null }, { priceFor: async () => null, reservedFor });
    expect(r).toEqual({ credits: 77, usd: null, bill: null });
    expect(reservedFor).toHaveBeenCalledWith("g1", generation);
  });

  it("a run with no recorded row (legacy) is priced from the Scribe row valid when it started", async () => {
    const legacy = { id: "g0", model_used: TRANSCRIBE_MODEL_ID, created_at: "2026-11-22T00:00:00Z", org_id: "o1", model_price_id: null };
    const found = await priceForGeneration(legacy);
    expect(found?.id).toBe(row.id);
    const r = await settleTranscribe(
      { generation: legacy, secondsDone: 60, providerCredits: 17, providerUsd: null },
      { priceFor: priceForGeneration, reservedFor: async () => 77 },
    );
    expect(r.usd).toBeCloseTo(17 * 0.000182, 10);
  });
});
