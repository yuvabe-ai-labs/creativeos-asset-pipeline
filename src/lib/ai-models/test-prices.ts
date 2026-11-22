// D534 — the seeded price rows, for tests anywhere in the app that need a model's real price.
// Not imported by app code.
import { priceRowsFromCodeTables, seedRowToPrice } from "./price-seed";
import { currentPrice } from "./pricing";
import type { AiCatalog, AiModelPrice } from "./types";

let catalog: AiCatalog | null = null;

export function seededCatalog(): AiCatalog {
  catalog ??= { models: [], prices: priceRowsFromCodeTables().map(seedRowToPrice) };
  return catalog;
}

export function seededPrice(modelId: string, at: Date = new Date("2026-11-22T00:00:00Z")): AiModelPrice {
  const price = currentPrice(seededCatalog(), modelId, at);
  if (!price) throw new Error(`No seeded price for ${modelId}`);
  return price;
}
