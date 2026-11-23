import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const generate = vi.fn();
// "seed" = the model's seeded row; "none" = no row; an object = that row.
const priceState = vi.hoisted(() => ({ mode: "seed" as "seed" | "none" | Record<string, unknown> }));
vi.mock("@/lib/ai-models/catalog", async () => {
  const { seededModelCatalog } = await import("@/lib/ai-models/test-catalog");
  return { getAiCatalog: async () => seededModelCatalog() };
});
vi.mock("@/lib/image-gen/adapters", () => ({
  imageAdapters: { "image:gemini-3.1-flash-image": (...a: unknown[]) => generate(...a) },
}));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: vi.fn(), succeedGeneration: vi.fn(), failGeneration: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { reserveCredits: vi.fn(), settleGeneration: vi.fn(), refundReservation: vi.fn(), CreditLimitError };
});
vi.mock("@/lib/ai-models/run-price", async () => {
  const { seededPrice } = await import("@/lib/ai-models/test-prices");
  return {
    NO_PRICE_MESSAGE: "This model has no price set, so it can't run right now.",
    priceForNewRun: async (modelId: string) => {
      if (priceState.mode === "none") return null;
      if (typeof priceState.mode === "object") return priceState.mode;
      try { return seededPrice(modelId); } catch { return null; }
    },
  };
});
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ width: 768, height: 1365 }) }) }));

import { runBilledImageGeneration } from "../billed-run";
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
  vi.mocked(failGeneration).mockResolvedValue(undefined);
  vi.mocked(refundReservation).mockResolvedValue(undefined);
  vi.mocked(insertGeneration).mockResolvedValue({ id: "g1", created_at: "x", status: "running" } as never);
  vi.mocked(reserveCredits).mockResolvedValue({ ok: true });
  store.mockResolvedValue({ url: "https://storage.googleapis.com/b/panel.png" });
  generate.mockResolvedValue({ imageBase64: BYTES.toString("base64"), mimeType: "image/png", tokensUsed: { text_input_tokens: 180, image_input_tokens: 0, image_output_tokens: 1120, total_tokens: 1300 } });
});

describe("runBilledImageGeneration", () => {
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

  it("refuses a retired model before recording or reserving anything (D540)", async () => {
    await expect(runBilledImageGeneration({ ...args(), modelId: "openai:gpt-image-1" })).rejects.toThrow(
      "This model was retired. Pick another.",
    );
    expect(insertGeneration).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
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
