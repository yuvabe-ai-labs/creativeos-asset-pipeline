import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../catalog", async () => {
  const { seededCatalog } = await import("../test-prices");
  return { getAiCatalog: async () => seededCatalog() };
});

import { priceForNewRun, priceForGeneration } from "../run-price";
import { seededPrice } from "../test-prices";

describe("priceForNewRun", () => {
  it("is the row valid at the moment", async () => {
    expect((await priceForNewRun("gemini:gemini-omni-1.1-flash", new Date("2026-12-04T00:00:00Z")))?.effectiveFrom)
      .toBe("2026-12-03T08:00:00.000Z");
  });
  it("is null for a model with no price", async () => {
    expect(await priceForNewRun("vendor:unknown")).toBeNull();
  });
});

describe("priceForGeneration", () => {
  it("uses the row the run recorded, whatever its date", async () => {
    const old = seededPrice("gemini:gemini-omni-1.1-flash", new Date("2026-11-01T00:00:00Z"));
    const p = await priceForGeneration({ model_used: "gemini:gemini-omni-1.1-flash", created_at: "2026-12-10T00:00:00Z", model_price_id: old.id });
    expect(p?.id).toBe(old.id);
  });
  it("keeps the older Kling row over the newer unit row that its created_at falls under", async () => {
    const old = seededPrice("kling:kling-3-0", new Date("2026-11-22T00:00:00Z"));
    const newer = seededPrice("kling:kling-3-0", new Date("2026-11-24T00:00:00Z"));
    expect(newer.id).not.toBe(old.id);
    const p = await priceForGeneration({ model_used: "kling:kling-3-0", created_at: "2026-11-24T00:00:00Z", model_price_id: old.id });
    expect(p?.id).toBe(old.id);
    expect(await priceForGeneration({ model_used: "kling:kling-3-0", created_at: "2026-11-24T00:00:00Z" })).toMatchObject({ id: newer.id });
  });
  it("falls back to the row valid when the run started", async () => {
    const p = await priceForGeneration({ model_used: "gemini:gemini-omni-1.1-flash", created_at: "2026-12-10T00:00:00Z" });
    expect(p?.effectiveFrom).toBe("2026-12-03T08:00:00.000Z");
  });
  it("prices a run whose recorded row is not in the catalog with the row valid when it started", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const p = await priceForGeneration({ id: "g9", model_used: "gemini:gemini-omni-1.1-flash", created_at: "2026-11-01T00:00:00Z", model_price_id: "00000000-0000-0000-0000-000000000000" });
    expect(p?.effectiveFrom).not.toBe("2026-12-03T08:00:00.000Z");
    expect(p).not.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("is null without a model", async () => {
    expect(await priceForGeneration({ model_used: null, created_at: "2026-11-22T00:00:00Z" })).toBeNull();
  });
});
