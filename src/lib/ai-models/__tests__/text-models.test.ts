import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { TEXT_MODEL_IDS, APIFY_MODEL_ID, textModelRows, TEXT_SEED_HEADER } from "../text-models";
import { textPriceRows, TEXT_PRICE_HEADER } from "../seeds/text-price-rows";
import { seedSql } from "../seed";
import { priceSql } from "../price-sql";
import { seededPrice } from "../test-prices";
import { parseAiModelRow, parseAiModelPriceRow } from "../schema";

const drift = (file: string, sql: string) => {
  const path = resolve(process.cwd(), "supabase/migrations", file);
  if (process.env.UPDATE_SEED === "1") writeFileSync(path, sql);
  expect(existsSync(path), "run with UPDATE_SEED=1 to write it").toBe(true);
  expect(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).toBe(sql);
};

describe("text and scrape models", () => {
  it("one live row per id, each passing the catalog's check", () => {
    const rows = textModelRows();
    expect(rows.map((r) => r.id).sort()).toEqual([...TEXT_MODEL_IDS, APIFY_MODEL_ID].sort());
    for (const r of rows) expect(parseAiModelRow({ ...r, description: null, provider_model_id: null, updated_at: "x" }), r.id).not.toBeNull();
  });
  it("every model has a price; text rows price input, cached input and output; Apify prices usd", () => {
    const prices = textPriceRows();
    for (const id of TEXT_MODEL_IDS) {
      const rows = prices.filter((x) => x.model_id === id);
      expect(rows.length, id).toBeGreaterThan(0);
      for (const p of rows) {
        expect(parseAiModelPriceRow({ id: "x", ...p }), id).not.toBeNull();
        expect(p.lines.map((l) => l.meter).sort(), id).toEqual(["cached_input_token", "input_token", "text_output_token"]);
        expect(p.source_url, id).toMatch(/^https:\/\//);
      }
    }
    expect(prices.find((x) => x.model_id === APIFY_MODEL_ID)!.lines).toEqual([{ meter: "usd", unit_usd: 1 }]);
  });
  it("Gemini 3.8 Flash is priced at its introductory rate until 2027-01-01, then at the full rate", () => {
    const rates = (at: string) => seededPrice("gemini:gemini-3.8-flash", new Date(at)).lines.map((l) => [l.meter, l.unit_usd]);
    const intro = [["input_token", 7.5e-7], ["cached_input_token", 7.5e-8], ["text_output_token", 3.75e-6]];
    const full = [["input_token", 1.5e-6], ["cached_input_token", 1.5e-7], ["text_output_token", 7.5e-6]];
    expect(rates("2026-12-31T23:59:59Z")).toEqual(intro);
    expect(rates("2027-01-01T00:00:00Z")).toEqual(full);
    expect(rates("2027-06-01T00:00:00Z")).toEqual(full);
  });
  it("0082 and 0083 match the builders", () => {
    drift("0082_ai_text_models.sql", seedSql(textModelRows(), TEXT_SEED_HEADER));
    drift("0083_ai_text_prices.sql", priceSql(textPriceRows(), TEXT_PRICE_HEADER));
  });
});
