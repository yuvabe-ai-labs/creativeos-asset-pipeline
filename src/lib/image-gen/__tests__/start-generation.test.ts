import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  hasRunningGeneration: vi.fn(async () => false),
  insertGeneration: vi.fn(async () => ({ id: "g1" })),
  failGeneration: vi.fn(async () => undefined),
  insertVersion: vi.fn(async () => ({ id: "v-failed" })),
  reserveCredits: vi.fn(async () => ({ ok: true })),
  refundReservation: vi.fn(async () => undefined),
  uploadImageGenMask: vi.fn(async () => "https://storage.googleapis.com/b/g1-mask.png"),
  signImageGenResultUploads: vi.fn(async () => ({
    "image/png": { putUrl: "https://put/png", url: "https://storage.googleapis.com/b/g1.png" },
    "image/jpeg": { putUrl: "https://put/jpg", url: "https://storage.googleapis.com/b/g1.jpg" },
    "image/webp": { putUrl: "https://put/webp", url: "https://storage.googleapis.com/b/g1.webp" },
  })),
  trigger: vi.fn(async () => ({ id: "run-1" })),
}));

vi.mock("@/lib/db/generations", () => ({
  hasRunningGeneration: m.hasRunningGeneration,
  insertGeneration: m.insertGeneration,
  failGeneration: m.failGeneration,
}));
vi.mock("@/lib/db/versions", () => ({ insertVersion: m.insertVersion }));
vi.mock("@/lib/db/credit-transactions", () => ({
  reserveCredits: m.reserveCredits,
  refundReservation: m.refundReservation,
  CreditLimitError: class CreditLimitError extends Error {},
}));
vi.mock("@/lib/storage", () => ({
  uploadImageGenMask: m.uploadImageGenMask,
  signImageGenResultUploads: m.signImageGenResultUploads,
}));
vi.mock("@/lib/image-gen/estimate", () => ({ estimateImageGenerationCostUsd: () => 0.04 }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: m.trigger } }));

import {
  startImageGeneration,
  START_FAILED_MESSAGE,
  type StartImageGenerationInput,
} from "../start-generation";

const input: StartImageGenerationInput = {
  nodeId: "n1",
  clientId: "c1",
  orgId: "org-1",
  caller: { userId: "u1", email: "u@x.com" } as StartImageGenerationInput["caller"],
  modelId: "openai:gpt-image-2",
  params: { quality: "high" },
  prompt: "A mug on a desk",
  referenceUrls: ["https://cdn/ref.png"],
  inputsUsed: { promptNodeId: "p1" },
};

beforeEach(() => vi.clearAllMocks());

describe("startImageGeneration (D366)", () => {
  it("refuses a second run on the same node, before inserting or reserving", async () => {
    m.hasRunningGeneration.mockResolvedValueOnce(true);
    const res = await startImageGeneration(input);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This node is already generating.");
    expect(m.insertGeneration).not.toHaveBeenCalled();
    expect(m.reserveCredits).not.toHaveBeenCalled();
  });

  it("records the run, reserves, starts the task and answers 202 with the generation id", async () => {
    const res = await startImageGeneration(input);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "g1" });
    expect(m.insertGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "n1", type: "image", modelUsed: "openai:gpt-image-2" }),
    );
    expect(m.reserveCredits).toHaveBeenCalledWith("org-1", "g1", expect.any(Number));
    expect(m.trigger).toHaveBeenCalledWith(
      "image-generate",
      expect.objectContaining({
        generationId: "g1",
        modelId: "openai:gpt-image-2",
        prompt: "A mug on a desk",
        referenceUrls: ["https://cdn/ref.png"],
        params: { quality: "high" },
        uploads: expect.objectContaining({ "image/png": expect.any(Object) }),
      }),
    );
  });

  it("uploads a painted mask and gives the task its URL, never the bytes", async () => {
    await startImageGeneration({ ...input, mask: { base64: "AAAA", mime: "image/png" } });
    expect(m.uploadImageGenMask).toHaveBeenCalledWith({
      nodeId: "n1",
      generationId: "g1",
      base64: "AAAA",
      mime: "image/png",
    });
    const payload = (m.trigger.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(payload.maskUrl).toBe("https://storage.googleapis.com/b/g1-mask.png");
    expect(JSON.stringify(payload)).not.toContain("AAAA");
  });

  it("answers 402 and refunds when the credit limit is reached, without starting the task", async () => {
    m.reserveCredits.mockResolvedValueOnce({ ok: false });
    const res = await startImageGeneration(input);
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("Monthly credit limit reached");
    expect(m.trigger).not.toHaveBeenCalled();
    expect(m.failGeneration).toHaveBeenCalledWith(expect.objectContaining({ generationId: "g1" }));
    expect(m.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });

  it("fails, refunds and records the failed attempt when the task cannot be started", async () => {
    m.trigger.mockRejectedValueOnce(new Error("trigger down"));
    const res = await startImageGeneration(input);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(START_FAILED_MESSAGE);
    expect(m.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: "trigger down" });
    expect(m.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
    expect(m.insertVersion).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "n1", error: START_FAILED_MESSAGE }),
    );
  });
});
