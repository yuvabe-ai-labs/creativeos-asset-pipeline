import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const generate = vi.fn();
// "seed" = the model's seeded row; "none" = no row; an object = that row.
const priceState = vi.hoisted(() => ({
  mode: "seed" as "seed" | "none" | Record<string, unknown>,
  extraSettings: [] as Record<string, unknown>[],
}));
const MODEL = "gemini:gemini-3.1-flash-image";
vi.mock("@/lib/ai-models/catalog", async () => {
  const { seededModelCatalog } = await import("@/lib/ai-models/test-catalog");
  return {
    // The price comes from this catalog now, so the test shapes it: no row, or one given row.
    getAiCatalog: async () => {
      const base = seededModelCatalog();
      const others = base.prices.filter((p) => p.modelId !== MODEL);
      const prices = priceState.mode === "none" ? others : typeof priceState.mode === "object" ? [...others, priceState.mode as never] : base.prices;
      return { ...base, prices, creditSettings: [...base.creditSettings, ...(priceState.extraSettings as never[])] };
    },
  };
});
vi.mock("@/lib/image-gen/adapters", () => ({
  imageAdapters: { "image:gemini-3.1-flash-image": (...a: unknown[]) => generate(...a) },
}));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: vi.fn(), succeedGeneration: vi.fn(), failGeneration: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { reserveCredits: vi.fn(), settleGeneration: vi.fn(), refundReservation: vi.fn(), CreditLimitError };
});
vi.mock("@/lib/ai-models/run-price", () => ({
  NO_PRICE_MESSAGE: "This model has no price set, so it can't run right now.",
}));
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ width: 768, height: 1365 }) }) }));

import { runBilledImageGeneration } from "../billed-run";
import { ModelRefusedError } from "@/lib/ai-models/runnable";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { reserveCredits, settleGeneration, refundReservation } from "@/lib/db/credit-transactions";

const BYTES = Buffer.from("png");
const store = vi.fn();
const args = () => ({
  owner: { scriptId: "s1" }, orgId: "org-1", clientId: "c1", userId: "u1", userEmail: null,
  modelId: "gemini:gemini-3.1-flash-image", aspect: "9:16", prompt: "A panel.",
  referenceUrls: ["https://x/front.png"], inputsSnapshot: { slot: "panel", shotId: "s01" }, store,
});

beforeEach(() => {
  vi.resetAllMocks();
  priceState.mode = "seed";
  priceState.extraSettings = [];
  vi.mocked(failGeneration).mockResolvedValue(undefined);
  vi.mocked(refundReservation).mockResolvedValue(undefined);
  vi.mocked(insertGeneration).mockResolvedValue({ id: "g1", created_at: "2026-11-22T00:00:00Z", status: "running" } as never);
  vi.mocked(reserveCredits).mockResolvedValue({ ok: true });
  store.mockResolvedValue({ url: "https://storage.googleapis.com/b/panel.png" });
  generate.mockResolvedValue({ imageBase64: BYTES.toString("base64"), mimeType: "image/png", tokensUsed: { text_input_tokens: 180, image_input_tokens: 0, image_output_tokens: 1120, total_tokens: 1300 } });
});

describe("runBilledImageGeneration", () => {
  it("reserves with the settings row live when the run was recorded, not one that started after", async () => {
    await runBilledImageGeneration(args());
    const baseline = vi.mocked(reserveCredits).mock.calls[0][2];
    vi.mocked(reserveCredits).mockClear();
    // Starts after the insert (created_at 2026-11-22) and before the reservation (now).
    priceState.extraSettings = [{
      id: "late", effectiveFrom: "2026-11-23T00:00:00Z", marginPercent: 150, roundStep: 1, note: null,
    }];
    await runBilledImageGeneration(args());
    expect(vi.mocked(reserveCredits).mock.calls[0][2]).toBe(baseline);
    expect(vi.mocked(settleGeneration).mock.calls[1][0].actualAmount).toBeLessThanOrEqual(baseline);
  });

  it("records a script-owned generation and hands the provider's bytes to the owner's store", async () => {
    const out = await runBilledImageGeneration(args());
    expect(insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      scriptId: "s1", orgId: "org-1", type: "image", inputsSnapshot: { slot: "panel", shotId: "s01" },
    }));
    expect(Buffer.compare(store.mock.calls[0][0], BYTES)).toBe(0);
    expect(store.mock.calls[0][1]).toBe("image/png");
    expect(out.generation).toMatchObject({ status: "succeeded", output_snapshot: "https://storage.googleapis.com/b/panel.png" });
    expect(out.generation.meta).toMatchObject({ width: 768, height: 1365 });
  });

  it("refuses a retired model before recording or reserving anything (D563)", async () => {
    const err = await runBilledImageGeneration({ ...args(), modelId: "openai:gpt-image-1" }).catch((e) => e);
    expect(err).toBeInstanceOf(ModelRefusedError);
    expect(err.message).toBe("This model was retired. Pick another.");
    expect(insertGeneration).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("refuses an unknown model as unavailable, typed so a route can answer 400", async () => {
    const err = await runBilledImageGeneration({ ...args(), modelId: "nope:none" }).catch((e) => e);
    expect(err).toBeInstanceOf(ModelRefusedError);
    expect(err.message).toBe("This model isn't available. Pick another.");
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("refuses settings the model can't take without naming the model", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await runBilledImageGeneration({ ...args(), aspect: "not-an-aspect" }).catch((e) => e);
    expect(err.message).toBe("These settings aren't valid for this model.");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("gemini:gemini-3.1-flash-image"), expect.anything());
    expect(insertGeneration).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("says a run it can't price can't be priced, without naming the model, and refunds", async () => {
    const { seededPrice } = await import("@/lib/ai-models/test-prices");
    priceState.mode = { ...seededPrice("gemini:gemini-3.1-flash-image"), lines: [] };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await runBilledImageGeneration(args()).catch((e) => e);
    expect(err.message).toBe("This model can't be priced for these settings. Pick other settings or another model.");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("gemini:gemini-3.1-flash-image"));
    expect(reserveCredits).not.toHaveBeenCalled();
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
    log.mockRestore();
  });

  it("hands the adapter the catalog's spec and the row's model name", async () => {
    await runBilledImageGeneration(args());
    expect(generate.mock.calls[0][1]).toMatchObject({
      providerModelId: "gemini-3.1-flash-image",
      spec: { id: "gemini:gemini-3.1-flash-image", label: "Nano Banana 2" },
    });
  });

  it("refuses a model with no price before recording or reserving anything", async () => {
    priceState.mode = "none";
    await expect(runBilledImageGeneration(args())).rejects.toThrow("This model has no price set, so it can't run right now.");
    expect(insertGeneration).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("settles at the reserved estimate, never 0, when the provider billed meters with no price", async () => {
    const { seededPrice } = await import("@/lib/ai-models/test-prices");
    const seeded = seededPrice("gemini:gemini-3.1-flash-image");
    // Keep the image line (so an estimate exists) but drop every token line the provider reports.
    const price = { ...seeded, lines: seeded.lines.filter((l) => l.meter === "output_image") };
    priceState.mode = price;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runBilledImageGeneration(args());
    const reserved = vi.mocked(reserveCredits).mock.calls[0][2];
    expect(vi.mocked(settleGeneration)).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: reserved }));
    expect(vi.mocked(succeedGeneration)).toHaveBeenCalledWith(expect.objectContaining({ creditsCharged: reserved, costUsd: undefined }));
    expect(err).toHaveBeenCalledWith(expect.stringContaining("meters with no price"));
    err.mockRestore();
  });

  it("fails and refunds when the store throws", async () => {
    store.mockRejectedValue(new Error("bucket down"));
    await expect(runBilledImageGeneration(args())).rejects.toThrow("bucket down");
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });
});
