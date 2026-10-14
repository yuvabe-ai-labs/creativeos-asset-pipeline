import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const generate = vi.fn();
vi.mock("@/lib/image-gen/registry", () => ({
  imageGenRegistry: {
    "seedream:seedream-5-0-lite": {
      schema: { safeParse: (p: unknown) => ({ success: true, data: p }) },
      generate: (...a: unknown[]) => generate(...a),
    },
  },
}));
vi.mock("@/lib/db/generations", () => ({
  insertGeneration: vi.fn(), succeedGeneration: vi.fn(), failGeneration: vi.fn(),
}));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { reserveCredits: vi.fn(), settleGeneration: vi.fn(), refundReservation: vi.fn(), CreditLimitError };
});
vi.mock("@/lib/storage", () => ({ uploadAvatarGenerated: vi.fn() }));
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ width: 1536, height: 2048 }) }) }));

import { runAvatarGeneration } from "../generate";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import {
  reserveCredits, settleGeneration, refundReservation, CreditLimitError,
} from "@/lib/db/credit-transactions";
import { uploadAvatarGenerated } from "@/lib/storage";

const args = {
  clientId: "c1", avatarId: "a1", orgId: "org-1", userId: "user-1", userEmail: "op@x.com",
  slot: "front" as const, modelId: "seedream:seedream-5-0-lite", aspect: "3:4",
  prompt: "A chef.", referenceUrls: [], batchId: "b1",
};
const BYTES = Buffer.from("png-bytes");

beforeEach(() => {
  vi.resetAllMocks();
  // failGeneration/refundReservation are only asserted in the error-path tests, but the
  // implementation always awaits them with `.catch()` in its cleanup — resetAllMocks strips
  // any implementation, so without a resolved value here they'd return undefined and
  // `.catch()` on that throws before the real assertion runs. Every other suite that mocks
  // these two (prompt-run.test.ts, complete.test.ts, voice-change/route.test.ts,
  // video-generate/route.test.ts) gives them a resolving default for the same reason.
  vi.mocked(failGeneration).mockResolvedValue(undefined);
  vi.mocked(refundReservation).mockResolvedValue(undefined);
  vi.mocked(insertGeneration).mockResolvedValue({
    id: "g1", created_at: "2026-09-30T10:00:00.000Z", status: "running",
    model_used: args.modelId, inputs_snapshot: {}, meta: { email: "op@x.com" },
  } as never);
  vi.mocked(reserveCredits).mockResolvedValue({ ok: true });
  vi.mocked(uploadAvatarGenerated).mockResolvedValue({ url: "https://storage.googleapis.com/b/x.png", path: "x.png" });
  generate.mockResolvedValue({
    imageBase64: BYTES.toString("base64"), mimeType: "image/png",
    tokensUsed: { text_input_tokens: 0, image_input_tokens: 0, image_output_tokens: 0, total_tokens: 0 },
    costUsd: 0.035,
  });
});

describe("runAvatarGeneration", () => {
  it("reserves the estimate, stores the provider's bytes unchanged, and settles the real cost", async () => {
    const out = await runAvatarGeneration(args);

    expect(insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      avatarId: "a1", orgId: "org-1", clientId: "c1", type: "image", modelUsed: args.modelId,
      inputsSnapshot: { slot: "front", prompt: "A chef.", batchId: "b1", referenceUrls: [] },
    }));
    expect(reserveCredits).toHaveBeenCalledWith("org-1", "g1", 35);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "A chef.", referenceUrls: [], params: expect.objectContaining({ aspect_ratio: "3:4" }),
    }));
    const upload = vi.mocked(uploadAvatarGenerated).mock.calls[0][0];
    expect(Buffer.compare(upload.body as Buffer, BYTES)).toBe(0);
    expect(upload).toMatchObject({ clientId: "c1", avatarId: "a1", slot: "front", ext: "png" });
    expect(settleGeneration).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1", actualAmount: 35 });
    expect(succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({
      generationId: "g1", creditsCharged: 35, costUsd: 0.035,
      outputSnapshot: "https://storage.googleapis.com/b/x.png",
      meta: { email: "op@x.com", width: 1536, height: 2048, sizeBytes: BYTES.length },
    }));
    expect(refundReservation).not.toHaveBeenCalled();

    expect(out.creditsCharged).toBe(35);
    expect(out.generation).toMatchObject({
      id: "g1", status: "succeeded", credits_charged: 35,
      output_snapshot: "https://storage.googleapis.com/b/x.png",
      inputs_snapshot: { slot: "front", prompt: "A chef.", batchId: "b1", referenceUrls: [] },
    });
  });

  it("refuses at the cap without calling the provider, and refunds nothing it did not take", async () => {
    vi.mocked(reserveCredits).mockResolvedValue({ ok: false });
    await expect(runAvatarGeneration(args)).rejects.toBeInstanceOf(CreditLimitError);
    expect(generate).not.toHaveBeenCalled();
    expect(failGeneration).toHaveBeenCalledWith(expect.objectContaining({ generationId: "g1" }));
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });

  it("fails the generation and refunds when the provider throws", async () => {
    generate.mockRejectedValue(new Error("Content blocked"));
    await expect(runAvatarGeneration(args)).rejects.toThrow("Content blocked");
    expect(failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: "Content blocked" });
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
    expect(settleGeneration).not.toHaveBeenCalled();
  });

  it("rejects an unknown model before creating a generation", async () => {
    await expect(runAvatarGeneration({ ...args, modelId: "nope:none" })).rejects.toThrow(/Unknown model/);
    expect(insertGeneration).not.toHaveBeenCalled();
  });
});
