// D557 — the price rows migration 0078 seeded (frozen history), for tests anywhere in the app.
// Not imported by app code.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEED_JSON_TAG } from "./seed";
import { parseAiModelPriceRow } from "./schema";
import { currentPrice } from "./pricing";
import type { AiCatalog, AiModelPrice } from "./types";

let catalog: AiCatalog | null = null;

const MIGRATIONS = ["0078_ai_model_prices_seed.sql", "0080_ai_service_prices.sql", "0083_ai_text_prices.sql"];

export function seededCatalog(): AiCatalog {
  if (catalog) return catalog;
  const prices = MIGRATIONS.flatMap((name) => {
    const file = resolve(process.cwd(), "supabase/migrations", name);
    if (!existsSync(file)) return [];
    const sql = readFileSync(file, "utf8");
    const rows = JSON.parse(sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG))) as
      Array<{ model_id: string; effective_from: string }>;
    return rows.map((row) => {
      const price = parseAiModelPriceRow({ id: `${row.model_id}@${row.effective_from}`, ...row });
      if (!price) throw new Error(`${name} row for ${row.model_id} fails the catalog's check`);
      return price;
    });
  });
  catalog = { models: [], prices, creditSettings: [] };
  return catalog;
}

export function seededPrice(modelId: string, at: Date = new Date("2026-11-22T00:00:00Z")): AiModelPrice {
  const price = currentPrice(seededCatalog(), modelId, at);
  if (!price) throw new Error(`No seeded price for ${modelId}`);
  return price;
}
