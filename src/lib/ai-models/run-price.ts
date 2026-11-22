import "server-only";
import { getAiCatalog } from "./catalog";
import { currentPrice, priceById } from "./pricing";
import type { AiModelPrice } from "./types";

// D534 — where a run's price comes from: the catalog row valid when it starts. A run records the
// row it reserved with, and is charged with that same row when it finishes.
export const NO_PRICE_MESSAGE = "This model has no price set, so it can't run right now.";

export async function priceForNewRun(modelId: string, at: Date = new Date()): Promise<AiModelPrice | null> {
  return currentPrice(await getAiCatalog(), modelId, at);
}

export async function priceForGeneration(g: {
  model_used: string | null;
  created_at: string;
  model_price_id?: string | null;
}): Promise<AiModelPrice | null> {
  const catalog = await getAiCatalog();
  if (g.model_price_id) return priceById(catalog, g.model_price_id);
  // A run started before prices were recorded on it: the row valid when it started.
  return g.model_used ? currentPrice(catalog, g.model_used, new Date(g.created_at)) : null;
}
