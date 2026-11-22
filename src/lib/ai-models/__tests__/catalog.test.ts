import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const tables: Record<string, { data: unknown[] | null; error: unknown }> = {};
const selects: string[] = [];
// When set, every read waits on it after taking its rows (so a test can hold a load open).
let gate: Promise<void> | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        order: async () => {
          const result = tables[table];
          selects.push(table);
          if (gate) await gate;
          return result;
        },
      }),
    }),
  }),
}));

import { getAiCatalog, clearAiCatalogCache, currentPrice, CATALOG_CACHE_MS } from "../catalog";
import type { AiCatalog } from "../types";

const MODEL = {
  id: "kling:kling-3-0-omni", provider: "kling", kind: "video", label: "Kling 3.0 Omni",
  picker_label: null, provider_label: "Kling", description: null, status: "live", replaced_by: null,
  sort_order: 0, adapter_key: "video:kling", provider_model_id: null, params: [], rules: [],
  capabilities: { maxDurationSeconds: 15 }, updated_at: "2026-11-21T00:00:00Z",
};
const PRICE = (id: string, from: string) => ({
  id, model_id: MODEL.id, effective_from: from, lines: [{ meter: "provider_unit", unit_usd: 0.1508 }],
  estimate: {}, source_url: null, note: null,
});

beforeEach(() => {
  clearAiCatalogCache();
  gate = null;
  selects.length = 0;
  tables.ai_models = { data: [MODEL], error: null };
  tables.ai_model_prices = { data: [PRICE("p1", "2026-11-01T00:00:00Z")], error: null };
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("getAiCatalog", () => {
  it("loads models and prices with one query each", async () => {
    const catalog = await getAiCatalog();
    expect(catalog.models.map((m) => m.id)).toEqual([MODEL.id]);
    expect(catalog.prices.map((p) => p.id)).toEqual(["p1"]);
    expect(selects.sort()).toEqual(["ai_model_prices", "ai_models"]);
  });

  it("serves the cache within 60 seconds and reloads after", async () => {
    await getAiCatalog();
    vi.advanceTimersByTime(CATALOG_CACHE_MS - 1);
    await getAiCatalog();
    expect(selects).toHaveLength(2);
    vi.advanceTimersByTime(2);
    await getAiCatalog();
    expect(selects).toHaveLength(4);
  });

  it("shares one load between concurrent callers", async () => {
    await Promise.all([getAiCatalog(), getAiCatalog(), getAiCatalog()]);
    expect(selects).toHaveLength(2);
  });

  it("leaves out a row that fails its check", async () => {
    tables.ai_models = { data: [MODEL, { ...MODEL, id: "bad", kind: "podcast" }], error: null };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const catalog = await getAiCatalog();
    expect(catalog.models.map((m) => m.id)).toEqual([MODEL.id]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("throws on a failed read and caches nothing", async () => {
    tables.ai_models = { data: null, error: new Error("down") };
    await expect(getAiCatalog()).rejects.toThrow("down");
    tables.ai_models = { data: [MODEL], error: null };
    await expect(getAiCatalog()).resolves.toMatchObject({ models: [{ id: MODEL.id }] });
  });

  it("a cache clear during a load is not undone by that load", async () => {
    let release!: () => void;
    gate = new Promise<void>((resolve) => { release = resolve; });
    const first = getAiCatalog(); // the old load reads its rows now, then waits on the gate
    clearAiCatalogCache();
    tables.ai_models = { data: [{ ...MODEL, label: "Kling 3.0 Omni (new)" }], error: null };
    gate = null;
    const after = getAiCatalog(); // arrives after the clear: must load fresh, not join the old load
    release();
    await first;
    expect((await after).models[0].label).toBe("Kling 3.0 Omni (new)");
    // The old load finished after the clear and must not have written its rows into the cache.
    expect((await getAiCatalog()).models[0].label).toBe("Kling 3.0 Omni (new)");
  });
});

describe("currentPrice", () => {
  const catalog = (): AiCatalog => ({
    models: [],
    prices: [
      { id: "old", modelId: MODEL.id, effectiveFrom: "2026-11-01T00:00:00Z", lines: [], estimate: {}, sourceUrl: null, note: null },
      { id: "new", modelId: MODEL.id, effectiveFrom: "2026-12-03T08:00:00Z", lines: [], estimate: {}, sourceUrl: null, note: null },
    ],
  });

  it("is the latest row at or before the moment", () => {
    expect(currentPrice(catalog(), MODEL.id, new Date("2026-12-03T07:59:59Z"))?.id).toBe("old");
    expect(currentPrice(catalog(), MODEL.id, new Date("2026-12-03T08:00:00Z"))?.id).toBe("new");
  });

  it("is null before the first row, or for another model", () => {
    expect(currentPrice(catalog(), MODEL.id, new Date("2026-10-01T00:00:00Z"))).toBeNull();
    expect(currentPrice(catalog(), "other", new Date("2026-12-31T00:00:00Z"))).toBeNull();
  });
});
