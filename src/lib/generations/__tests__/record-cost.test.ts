import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { recordProviderCost } from "../record-cost";
import type { AiModelPrice } from "@/lib/ai-models/types";

const price = {
  id: "price-1",
  lines: [
    { meter: "input_token", unit_usd: 0.000001 },
    { meter: "text_output_token", unit_usd: 0.000004 },
  ],
} as unknown as AiModelPrice;

const base = { orgId: "org-1", clientId: "c-1", userEmail: "a@b.co", type: "script" as const, modelId: "gpt-x" };

describe("recordProviderCost", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("records the price row, the cost and a provider_usage bill", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const meters = { input_token: 1000, text_output_token: 500 };
    await recordProviderCost({ ...base, meters, raw: { a: 1 } }, { priceFor: vi.fn().mockResolvedValue(price), insert });
    expect(insert).toHaveBeenCalledTimes(1);
    const arg = insert.mock.calls[0][0];
    expect(arg).toMatchObject({
      orgId: "org-1", clientId: "c-1", userEmail: "a@b.co", type: "script",
      modelUsed: "gpt-x", modelPriceId: "price-1",
      providerBill: { source: "provider_usage", meters, raw: { a: 1 } },
    });
    expect(arg.costUsd).toBeCloseTo(0.003);
    expect(arg).not.toHaveProperty("modelId");
    expect(arg).not.toHaveProperty("meters");
    expect(arg).not.toHaveProperty("raw");
  });

  it("marks an Apify usd bill as provider_charge", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const p = { id: "p2", lines: [{ meter: "usd", unit_usd: 1 }] } as unknown as AiModelPrice;
    await recordProviderCost({ ...base, type: "scrape", meters: { usd: 0.02 } }, { priceFor: vi.fn().mockResolvedValue(p), insert });
    expect(insert.mock.calls[0][0].providerBill.source).toBe("provider_charge");
  });

  it("records an unpriced model with null price and cost, keeping the bill", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const meters = { input_token: 10 };
    await recordProviderCost({ ...base, meters }, { priceFor: vi.fn().mockResolvedValue(null), insert });
    expect(insert.mock.calls[0][0]).toMatchObject({ modelPriceId: null, costUsd: null, providerBill: { meters } });
  });

  it("leaves cost null when a meter has no price line", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    await recordProviderCost({ ...base, meters: { input_token: 10, cached_input_token: 5 } }, { priceFor: vi.fn().mockResolvedValue(price), insert });
    expect(insert.mock.calls[0][0]).toMatchObject({ modelPriceId: "price-1", costUsd: null });
  });

  it("inserts nothing for empty meters", async () => {
    const insert = vi.fn();
    const priceFor = vi.fn();
    await recordProviderCost({ ...base, meters: {} }, { priceFor, insert });
    expect(insert).not.toHaveBeenCalled();
    expect(priceFor).not.toHaveBeenCalled();
  });

  it("still records the call, unpriced, when the price lookup throws", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const meters = { input_token: 10 };
    await recordProviderCost({ ...base, meters }, { priceFor: vi.fn().mockRejectedValue(new Error("catalog down")), insert });
    expect(insert.mock.calls[0][0]).toMatchObject({ modelPriceId: null, costUsd: null, providerBill: { source: "provider_usage", meters } });
    expect(errorSpy).toHaveBeenCalledWith("[record-cost]", expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });

  it("resolves and logs when the insert throws", async () => {
    const insert = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(
      recordProviderCost({ ...base, meters: { input_token: 10 } }, { priceFor: vi.fn().mockResolvedValue(price), insert }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("[record-cost]", "script", "gpt-x", "db down");
  });
});
