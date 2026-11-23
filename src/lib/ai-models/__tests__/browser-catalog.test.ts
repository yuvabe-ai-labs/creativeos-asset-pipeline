import { describe, it, expect } from "vitest";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { browserCatalog } from "@/lib/ai-models/browser-catalog";

describe("browserCatalog", () => {
  it("drops draft models and their prices, and keeps the rest as they are", () => {
    const id = "gemini:gemini-3-pro-image";
    const catalog = withModel(seededModelCatalog(), id, { status: "draft" });
    const out = browserCatalog(catalog);
    expect(out.models.some((m) => m.id === id)).toBe(false);
    expect(out.prices.some((p) => p.modelId === id)).toBe(false);
    expect(out.models.length).toBe(catalog.models.length - 1);
    expect(out.prices.length).toBe(catalog.prices.filter((p) => p.modelId !== id).length);
  });
});
