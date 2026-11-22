import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { MODEL_COLUMNS, PRICE_COLUMNS, parseAiModelPriceRow, parseAiModelRow } from "./schema";
import type { AiCatalog, AiModel, AiModelPrice } from "./types";

// D529 — the catalog is read once and kept for a minute per server instance: a run reads its
// model and price from memory, never with a query of its own. An admin change clears the cache
// in the instance that made it; other instances pick it up within a minute (a price applies by
// its date, so that delay never changes a charge).
export const CATALOG_CACHE_MS = 60_000;

let cached: { at: number; catalog: AiCatalog } | null = null;
let inflight: Promise<AiCatalog> | null = null;

export function clearAiCatalogCache(): void {
  cached = null;
}

export async function getAiCatalog(): Promise<AiCatalog> {
  if (cached && Date.now() - cached.at < CATALOG_CACHE_MS) return cached.catalog;
  if (inflight) return inflight;
  inflight = loadAiCatalog()
    .then((catalog) => {
      cached = { at: Date.now(), catalog };
      return catalog;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
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
  return { models, prices };
}

/** D530 — the price row a run starting at `at` uses: the latest one at or before it. */
export function currentPrice(catalog: AiCatalog, modelId: string, at: Date): AiModelPrice | null {
  let best: AiModelPrice | null = null;
  for (const p of catalog.prices) {
    if (p.modelId !== modelId || new Date(p.effectiveFrom) > at) continue;
    if (!best || new Date(p.effectiveFrom) > new Date(best.effectiveFrom)) best = p;
  }
  return best;
}
