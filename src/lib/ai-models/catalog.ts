import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { MODEL_COLUMNS, PRICE_COLUMNS, parseAiModelPriceRow, parseAiModelRow } from "./schema";
import type { AiCatalog, AiModel, AiModelPrice } from "./types";

// Kept importable from here for existing callers; it is pure and lives in pricing.ts.
export { currentPrice } from "./pricing";

// D529 — the catalog is read once and kept for a minute per server instance: a run reads its
// model and price from memory, never with a query of its own. An admin change clears the cache
// in the instance that made it; other instances pick it up within a minute (a price applies by
// its date, so that delay never changes a charge).
export const CATALOG_CACHE_MS = 60_000;

let cached: { at: number; catalog: AiCatalog } | null = null;
let inflight: Promise<AiCatalog> | null = null;
// Bumped by every clear, so a load that started before a clear cannot write the old catalog back.
let generation = 0;

export function clearAiCatalogCache(): void {
  generation += 1;
  cached = null;
  inflight = null;
}

export async function getAiCatalog(): Promise<AiCatalog> {
  if (cached && Date.now() - cached.at < CATALOG_CACHE_MS) return cached.catalog;
  if (inflight) return inflight;
  const startedAt = generation;
  const load: Promise<AiCatalog> = loadAiCatalog()
    .then((catalog) => {
      if (generation === startedAt) cached = { at: Date.now(), catalog };
      return catalog;
    })
    .finally(() => {
      if (inflight === load) inflight = null;
    });
  inflight = load;
  return load;
}

async function loadAiCatalog(): Promise<AiCatalog> {
  const db = createServerSupabase();
  const [modelsRes, pricesRes] = await Promise.all([
    db.from("ai_models").select(MODEL_COLUMNS).order("sort_order"),
    db.from("ai_model_prices").select(PRICE_COLUMNS).order("effective_from"),
  ]);
  // A failed read is never an empty catalog (performance rule 13).
  if (modelsRes.error) throw modelsRes.error;
  if (pricesRes.error) throw pricesRes.error;

  const models: AiModel[] = [];
  for (const row of modelsRes.data ?? []) {
    const model = parseAiModelRow(row);
    if (model) models.push(model);
    else console.error("[ai-models] model row failed its check — left out", { id: (row as { id?: unknown }).id });
  }
  const prices: AiModelPrice[] = [];
  for (const row of pricesRes.data ?? []) {
    const price = parseAiModelPriceRow(row);
    if (price) prices.push(price);
    else console.error("[ai-models] price row failed its check — left out", { id: (row as { id?: unknown }).id });
  }
  if (prices.length === 0) {
    console.error("[ai-models] no model prices loaded — every paid run will be refused; is migration 0078 applied?");
  }
  return { models, prices };
}
