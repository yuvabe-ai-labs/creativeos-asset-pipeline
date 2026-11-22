import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { priceRowsFromCodeTables, priceSeedSql } from "../price-seed";

// D534 — migration 0078 holds exactly the code tables' prices until Plan 2a-ii deletes the
// tables. Vitest runs from the repo root.
const FILE = resolve(process.cwd(), "supabase/migrations/0078_ai_model_prices_seed.sql");

describe("migration 0078 (ai_model_prices seed)", () => {
  it("matches the code tables", () => {
    const rows = priceRowsFromCodeTables();
    if (process.env.UPDATE_SEED === "1") writeFileSync(FILE, priceSeedSql(rows));
    expect(existsSync(FILE), "run with UPDATE_SEED=1 to write it").toBe(true);
    expect(readFileSync(FILE, "utf8").replace(/\r\n/g, "\n")).toBe(priceSeedSql(rows));
  });
});
