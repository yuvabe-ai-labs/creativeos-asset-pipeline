import "server-only";
import { getAiCatalog } from "./catalog";
import { currentPrice, priceById } from "./pricing";
import type { AiCatalog, AiModelPrice } from "./types";

// D557 — where a run's price comes from: the catalog row valid when it starts. A run records the
// row it reserved with, and is charged with that same row when it finishes.
export { NO_PRICE_MESSAGE } from "./service-models";

export class NoPriceError extends Error {}

/**
 * D571 — a price with the catalog it was read from, so a caller that also needs the credit
 * settings (creditSettingsAt) takes them from the same read instead of loading the catalog again.
 */
export type RunPricing = { price: AiModelPrice | null; catalog: AiCatalog };

export async function pricingForNewRun(modelId: string, at: Date = new Date()): Promise<RunPricing> {
  const catalog = await getAiCatalog();
  return { price: currentPrice(catalog, modelId, at), catalog };
}

export async function priceForNewRun(modelId: string, at: Date = new Date()): Promise<AiModelPrice | null> {
  return (await pricingForNewRun(modelId, at)).price;
}

type PricedGeneration = {
  id?: string;
  model_used: string | null;
  created_at: string;
  model_price_id?: string | null;
};

export async function pricingForGeneration(g: PricedGeneration): Promise<RunPricing> {
  const catalog = await getAiCatalog();
  if (g.model_price_id) {
    const recorded = priceById(catalog, g.model_price_id);
    if (recorded) return { price: recorded, catalog };
    // The recorded row is gone from the catalog: the provider has still billed us, so price the run
    // with the row valid when it started rather than charging nothing.
    console.error("[priceForGeneration] recorded price row missing from the catalog", {
      generationId: g.id,
      modelPriceId: g.model_price_id,
    });
  }
  // A run started before prices were recorded on it: the row valid when it started.
  return { price: g.model_used ? currentPrice(catalog, g.model_used, new Date(g.created_at)) : null, catalog };
}

export async function priceForGeneration(g: PricedGeneration): Promise<AiModelPrice | null> {
  return (await pricingForGeneration(g)).price;
}
