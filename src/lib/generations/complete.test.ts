import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  generation: {} as Record<string, unknown>,
  insertVersion: vi.fn(async () => ({ id: "ver-1" })),
  setActiveVersion: vi.fn(async () => undefined),
  succeedGeneration: vi.fn(async () => undefined),
  failGeneration: vi.fn(async () => undefined),
  settleGeneration: vi.fn(async () => undefined),
  refundReservation: vi.fn(async () => undefined),
  uploadVideoGen: vi.fn(async () => ({ url: "https://storage.googleapis.com/b/uploaded.mp4" })),
}));

vi.mock("@/lib/db/versions", () => ({
  insertVersion: mocks.insertVersion,
  setActiveVersion: mocks.setActiveVersion,
}));
vi.mock("@/lib/db/generations", () => ({
  getGeneration: vi.fn(async () => mocks.generation),
  succeedGeneration: mocks.succeedGeneration,
  failGeneration: mocks.failGeneration,
}));
vi.mock("@/lib/db/credit-transactions", () => ({
  settleGeneration: mocks.settleGeneration,
  refundReservation: mocks.refundReservation,
}));
vi.mock("@/lib/storage", () => ({
  uploadVideoGen: mocks.uploadVideoGen,
  isOwnStoredUrl: (url: string) => url.startsWith("https://storage.googleapis.com/b/"),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { canvases: { clients: { org_id: "org-1" } } },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { completeGeneration } from "./complete";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";

const ORIGINAL = "https://storage.googleapis.com/b/g1-original.mp4";
const REVOICED = "https://storage.googleapis.com/b/g1-revoiced.mp4";
const voice = (status: "applied" | "failed") => ({
  voiceId: "v1",
  voiceName: "Priya",
  status,
  originalUrl: ORIGINAL,
  ...(status === "failed" ? { error: "429" } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generation = {
    id: "g1",
    status: "running",
    node_id: "n1",
    org_id: "org-1",
    user_id: "u1",
    model_used: GEMINI_OMNI_MODEL_ID,
    params_snapshot: {},
    inputs_snapshot: {},
  };
});

const videoUsd = () => computeVideoCost(GEMINI_OMNI_MODEL_ID, 8, false, undefined)!.usd;

describe("completeGeneration — stored video with voice (D282)", () => {
  it("uses the stored URL as-is, records the voice and settles video + voice cost", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await completeGeneration({
      generationId: "g1",
      status: "succeeded",
      stored: true,
      videoUrl: REVOICED,
      durationSeconds: 8,
      meta: { voice: voice("applied") },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.uploadVideoGen).not.toHaveBeenCalled();
    expect(mocks.insertVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        output: REVOICED,
        paramsUsed: expect.objectContaining({
          durationSeconds: 8,
          voice: { ...voice("applied"), priceMultiplier: 1 },
        }),
      }),
    );
    expect(mocks.settleGeneration).toHaveBeenCalledWith({
      orgId: "org-1",
      generationId: "g1",
      actualAmount: usdToFinalCredits(videoUsd() + computeVoiceChangeCost(8).usd),
    });
    fetchSpy.mockRestore();
  });

  it("settles a custom-rate voice with its multiplier", async () => {
    await completeGeneration({
      generationId: "g1",
      status: "succeeded",
      stored: true,
      videoUrl: REVOICED,
      durationSeconds: 8,
      meta: { voice: { ...voice("applied"), priceMultiplier: 2 } },
    });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: usdToFinalCredits(videoUsd() + computeVoiceChangeCost(8, 2).usd) }),
    );
  });

  it("does not charge the voice when it failed", async () => {
    await completeGeneration({
      generationId: "g1",
      status: "succeeded",
      stored: true,
      videoUrl: ORIGINAL,
      durationSeconds: 8,
      meta: { voice: voice("failed") },
    });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: usdToFinalCredits(videoUsd()) }),
    );
  });

  it("fails and refunds a stored URL outside our bucket", async () => {
    await completeGeneration({
      generationId: "g1",
      status: "succeeded",
      stored: true,
      videoUrl: "https://evil.example/x.mp4",
      durationSeconds: 8,
    });
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.failGeneration).toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });
});

describe("completeGeneration — non-stored video (no voice)", () => {
  it("downloads from the provider, uploads to our bucket and settles video cost only", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    await completeGeneration({
      generationId: "g1",
      status: "succeeded",
      videoUrl: "https://provider.example/v.mp4",
      durationSeconds: 8,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://provider.example/v.mp4",
      expect.anything(),
    );
    expect(mocks.uploadVideoGen).toHaveBeenCalledWith({
      nodeId: "n1",
      contentType: "video/mp4",
      body: expect.any(Buffer),
    });
    expect(mocks.insertVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        output: "https://storage.googleapis.com/b/uploaded.mp4",
        paramsUsed: expect.not.objectContaining({ voice: expect.anything() }),
      }),
    );
    expect(mocks.settleGeneration).toHaveBeenCalledWith({
      orgId: "org-1",
      generationId: "g1",
      actualAmount: usdToFinalCredits(videoUsd()),
    });
    fetchSpy.mockRestore();
  });
});
