import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const generate = vi.fn();
vi.mock("@/lib/image-gen/registry", () => ({
  imageGenRegistry: {
    "gemini:gemini-3.1-flash-image": {
      schema: { safeParse: (p: unknown) => ({ success: true, data: p }) },
      generate: (...a: unknown[]) => generate(...a),
    },
  },
}));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: vi.fn(), succeedGeneration: vi.fn(), failGeneration: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { reserveCredits: vi.fn(), settleGeneration: vi.fn(), refundReservation: vi.fn(), CreditLimitError };
});
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ width: 768, height: 1365 }) }) }));

import { runBilledImageGeneration } from "../billed-run";
import { insertGeneration, failGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation } from "@/lib/db/credit-transactions";

const BYTES = Buffer.from("png");
const store = vi.fn();
const args = () => ({
  owner: { scriptId: "s1" }, orgId: "org-1", clientId: "c1", userId: "u1", userEmail: null,
  modelId: "gemini:gemini-3.1-flash-image", aspect: "9:16", prompt: "A panel.",
  referenceUrls: ["https://x/front.png"], inputsSnapshot: { slot: "panel", shotId: "s01" }, store,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(failGeneration).mockResolvedValue(undefined);
  vi.mocked(refundReservation).mockResolvedValue(undefined);
  vi.mocked(insertGeneration).mockResolvedValue({ id: "g1", created_at: "x", status: "running" } as never);
  vi.mocked(reserveCredits).mockResolvedValue({ ok: true });
  store.mockResolvedValue({ url: "https://storage.googleapis.com/b/panel.png" });
  generate.mockResolvedValue({ imageBase64: BYTES.toString("base64"), mimeType: "image/png", tokensUsed: { total_tokens: 0 }, costUsd: 0.067 });
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

  it("fails and refunds when the store throws", async () => {
    store.mockRejectedValue(new Error("bucket down"));
    await expect(runBilledImageGeneration(args())).rejects.toThrow("bucket down");
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });
});
