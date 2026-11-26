// D557 — one engine prices every estimate and every charge: quantity × the matching line.
// Client-safe: the focus views price their estimate with it too.
import type { AiCatalog, AiModelPrice, Meter, PriceLine } from "./types";

// How long each server instance keeps the catalog (D552). Pure, so client-safe code can use it.
export const CATALOG_CACHE_MS = 60_000;
// A dated catalog row (price or credit settings) that starts in the future starts at least this long
// after it is saved, and can't be cancelled or replaced in its last stretch of it. Two cache lifetimes
// make sure every server has the row before any run uses it, and still has it when a run records it.
export const CATALOG_CHANGE_LEAD_MS = 2 * CATALOG_CACHE_MS;

export type PriceDims = Record<string, string | number | boolean | undefined>;
export type MeterQuantities = Partial<Record<Meter, number>>;

/** The first line for this meter whose `when` matches every one of its keys; none = any run. */
export function lineFor(price: AiModelPrice, meter: Meter, dims: PriceDims): PriceLine | null {
  for (const line of price.lines) {
    if (line.meter !== meter) continue;
    if (Object.entries(line.when ?? {}).every(([key, value]) => dims[key] === value)) return line;
  }
  return null;
}

/** USD for these quantities. A meter with no matching line adds nothing and is listed. */
export function priceMeters(
  price: AiModelPrice,
  meters: MeterQuantities,
  dims: PriceDims = {},
): { usd: number; unpriced: Meter[] } {
  let usd = 0;
  const unpriced: Meter[] = [];
  for (const [meter, quantity] of Object.entries(meters) as [Meter, number | undefined][]) {
    if (quantity === undefined || !(Number.isFinite(quantity) && quantity > 0)) continue;
    const line = lineFor(price, meter, dims);
    if (!line) {
      unpriced.push(meter);
      continue;
    }
    usd += quantity * line.unit_usd;
  }
  return { usd, unpriced };
}

/** D553 — the price row a run starting at `at` uses: the latest one at or before it. */
export function currentPrice(catalog: Pick<AiCatalog, "prices">, modelId: string, at: Date): AiModelPrice | null {
  let best: AiModelPrice | null = null;
  for (const p of catalog.prices) {
    if (p.modelId !== modelId || new Date(p.effectiveFrom) > at) continue;
    if (!best || new Date(p.effectiveFrom) > new Date(best.effectiveFrom)) best = p;
  }
  return best;
}

export function priceById(catalog: Pick<AiCatalog, "prices">, id: string): AiModelPrice | null {
  return catalog.prices.find((p) => p.id === id) ?? null;
}
