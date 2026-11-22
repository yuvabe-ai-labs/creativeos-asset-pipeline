import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { servicePriceRows, SERVICE_PRICE_HEADER, KLING_UNIT_FROM } from "../seeds/service-price-rows";
import { priceSql } from "../price-sql";
import { SEED_JSON_TAG } from "../seed";
import { parseAiModelPriceRow } from "../schema";
import {
  dubUsd, lipSyncUsd, voiceChangeEstimateUsd, voiceChangeCharge, transcribeEstimateUsd, promptFlatCredits, promptCharge,
} from "../service-price";
import { seededPrice } from "../test-prices";
import { usdToFinalCredits } from "@/lib/credits/units";
import { computeDubCost, computeLipSyncCost } from "@/lib/dubbing/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import { computeCost } from "@/lib/pricing";
import { DUB_MODEL_ID, LIP_SYNC_MODEL_ID, VOICE_CHANGE_PRICE_MODEL_ID, TRANSCRIBE_MODEL_ID, PROMPT_MODEL_ID } from "../service-models";
import type { AiModelPrice } from "../types";

const FILE = resolve(process.cwd(), "supabase/migrations/0080_ai_service_prices.sql");
const rows = servicePriceRows();
const asPrice = (modelId: string, from = "2026-01-01T00:00:00.000Z"): AiModelPrice => {
  const r = rows.find((x) => x.model_id === modelId && x.effective_from === from)!;
  return parseAiModelPriceRow({ id: `${modelId}@${from}`, ...r })!;
};
const same = (a: number | null, b: number | null) => {
  if (a === null || b === null) return expect(a).toBe(b);
  expect(a).toBeCloseTo(b, 10);
  expect(usdToFinalCredits(a)).toBe(usdToFinalCredits(b));
};
const SECONDS = [0.4, 1, 3, 9.6, 30, 61, 600];

describe("seeded service rows price exactly what the code does", () => {
  it("every row passes the catalog's check", () => {
    for (const r of rows) expect(parseAiModelPriceRow({ id: "x", ...r }), r.model_id).not.toBeNull();
  });
  it("dub", () => { for (const s of SECONDS) same(dubUsd(asPrice(DUB_MODEL_ID), s), computeDubCost(s).usd); });
  it("lip sync", () => { for (const s of SECONDS) same(lipSyncUsd(asPrice(LIP_SYNC_MODEL_ID), s), computeLipSyncCost(s).usd); });
  it("voice change estimate, every multiplier", () => {
    for (const s of SECONDS) for (const m of [1, 1.5, 2, 3]) {
      same(voiceChangeEstimateUsd(asPrice(VOICE_CHANGE_PRICE_MODEL_ID), s, m), computeVoiceChangeCost(s, m).usd);
    }
  });
  it("voice change fallback charge (no provider credits reported) equals today's cost", () => {
    for (const s of SECONDS) for (const m of [1, 1.5, 2, 3]) {
      const c = voiceChangeCharge(asPrice(VOICE_CHANGE_PRICE_MODEL_ID), { characterCost: null, seconds: s, priceMultiplier: m })!;
      same(c.usd, computeVoiceChangeCost(s, m).usd);
    }
  });
  it("transcribe estimate is ceil(seconds x 0.2834) credits at $0.000182 (intended change from $0.40/hour, per the user's decision)", () => {
    for (const s of SECONDS) {
      const expected = Math.ceil(s * 0.2834) * 0.000182;
      expect(transcribeEstimateUsd(asPrice(TRANSCRIBE_MODEL_ID), s)).toBeCloseTo(expected, 12);
    }
  });
  it("prompt flat credits equal today's estimatePromptCredits", () => {
    for (const n of [0, 1, 2, 3, 4, 5]) expect(promptFlatCredits(asPrice(PROMPT_MODEL_ID), n)).toBe(estimatePromptCredits(n));
  });
  it("prompt run records today's token cost when nothing was cached, charging the flat price", () => {
    const usage = { prompt_tokens: 8606, completion_tokens: 160, total_tokens: 8766 };
    const c = promptCharge(asPrice(PROMPT_MODEL_ID), usage, 1)!;
    expect(c.recordedUsd).toBeCloseTo(computeCost(PROMPT_MODEL_ID, usage)!.usd, 10);
    expect(promptFlatCredits(asPrice(PROMPT_MODEL_ID), 1)).toBe(7.5);
  });
  // Restored with the full case in Task 4 (needs the { kind: "kling", units } usage).
  it.todo("Kling unit rows keep 0078's per-second lines and add $0.1508 a unit");
  it("Kling rows carry the provider_unit line at $0.1508", () => {
    for (const id of ["kling:kling-3-0", "kling:kling-o1", "kling:kling-3-0-omni"]) {
      const p = asPrice(id, KLING_UNIT_FROM);
      expect(p.lines.find((l) => l.meter === "provider_unit")?.unit_usd).toBe(0.1508);
      expect(p.lines.slice(0, -1)).toEqual(seededPrice(id, new Date("2026-11-22T12:00:00Z")).lines);
    }
  });
});

describe("migration 0080", () => {
  it("matches servicePriceRows", () => {
    if (process.env.UPDATE_SEED === "1") writeFileSync(FILE, priceSql(rows, SERVICE_PRICE_HEADER));
    expect(existsSync(FILE), "run with UPDATE_SEED=1 to write it").toBe(true);
    expect(readFileSync(FILE, "utf8").replace(/\r\n/g, "\n")).toBe(priceSql(rows, SERVICE_PRICE_HEADER));
    const sql = readFileSync(FILE, "utf8");
    const json = sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
  });
});
