// D548 — a stand-in for run-price.ts in tests: the seeded prices, and the pricing helpers that hand
// the price back with its catalog, so the credit settings a caller works out come from it. Not
// imported by app code. Use inside a vi.mock factory:
//   vi.mock("@/lib/ai-models/run-price", async () => (await import("@/lib/ai-models/test-run-price")).runPriceMock());
// The pricing helpers call priceForNewRun / priceForGeneration, so a test that overrides one of
// those (mockResolvedValueOnce) changes what the pricing helper returns too.
import { vi } from "vitest";
import { NO_PRICE_MESSAGE } from "./service-models";
import { seededModelCatalog } from "./test-catalog";
import { seededPrice } from "./test-prices";
import type { AiCatalog, AiModelPrice } from "./types";

type Gen = { model_used: string | null; created_at?: string };

/** `catalog` gives the catalog the pricing helpers return; null (the default) means the seeded one. */
export function runPriceMock(catalog: () => AiCatalog | null = () => null) {
  const priceForNewRun = vi.fn(async (modelId: string, _at?: Date): Promise<AiModelPrice | null> => {
    try { return seededPrice(modelId); } catch { return null; }
  });
  const priceForGeneration = vi.fn(async (g: Gen): Promise<AiModelPrice | null> =>
    g.model_used ? seededPrice(g.model_used, g.created_at ? new Date(g.created_at) : undefined) : null);
  const current = () => catalog() ?? seededModelCatalog();
  return {
    NO_PRICE_MESSAGE,
    NoPriceError: class NoPriceError extends Error {},
    priceForNewRun,
    priceForGeneration,
    pricingForNewRun: vi.fn(async (modelId: string, at?: Date) => ({ price: await priceForNewRun(modelId, at), catalog: current() })),
    pricingForGeneration: vi.fn(async (g: Gen) => ({ price: await priceForGeneration(g), catalog: current() })),
  };
}
