// D529 — the catalog the browser gets: every model but drafts (the super admin's alone), with
// their prices. Shared by GET /api/ai-models and the client layout that seeds the browser cache.
// Pure and client-safe.
import type { AiCatalog } from "./types";

export function browserCatalog(catalog: AiCatalog): AiCatalog {
  const models = catalog.models.filter((m) => m.status !== "draft");
  const ids = new Set(models.map((m) => m.id));
  return { models, prices: catalog.prices.filter((p) => ids.has(p.modelId)), creditSettings: catalog.creditSettings };
}
