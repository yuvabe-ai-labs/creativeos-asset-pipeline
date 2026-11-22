import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  generation: {} as Record<string, unknown>,
  insertVersion: vi.fn(async () => ({ id: "ver-1" })),
  setActiveVersion: vi.fn(async () => undefined),
  succeedGeneration: vi.fn(async () => undefined),
  failGeneration: vi.fn(async () => undefined),
  settleGeneration: vi.fn(async () => undefined),
  refundReservation: vi.fn(async () => undefined),
  getReservationAmounts: vi.fn(async () => new Map<string, number>([["g1", 77]])),
  uploadVideoGen: vi.fn(async () => ({ url: "https://storage.googleapis.com/b/uploaded.mp4" })),
  getClientById: vi.fn(async (): Promise<{ id: string; org_id: string } | null> => ({ id: "c1", org_id: "org-1" })),
  updateAvatar: vi.fn(async () => null),
  keepAutoVoice: vi.fn(async (): Promise<string | null> => "auto1"),
}));

vi.mock("@/lib/ai-models/run-price", async () => {
  const { seededPrice } = await import("@/lib/ai-models/test-prices");
  return {
    NO_PRICE_MESSAGE: "This model has no price set, so it can't run right now.",
    priceForNewRun: vi.fn(async (modelId: string) => {
      try { return seededPrice(modelId); } catch { return null; }
    }),
    priceForGeneration: vi.fn(async (g: { model_used: string | null; created_at?: string }) => (g.model_used ? seededPrice(g.model_used, g.created_at ? new Date(g.created_at) : undefined) : null)),
  };
});
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
  getReservationAmounts: mocks.getReservationAmounts,
}));
vi.mock("@/lib/storage", () => ({
  uploadVideoGen: mocks.uploadVideoGen,
  isOwnStoredUrl: (url: string) => url.startsWith("https://storage.googleapis.com/b/"),
}));
vi.mock("@/lib/db/clients", () => ({ getClientById: mocks.getClientById }));
vi.mock("@/lib/db/avatars", () => ({ updateAvatar: mocks.updateAvatar }));
vi.mock("@/lib/avatars/auto-voice", () => ({ keepAutoVoice: mocks.keepAutoVoice }));
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

import { completeGeneration, isVideoSucceeded, type CompleteGenerationInput } from "./complete";
import { IMAGE_GENERATION_FAILED_MESSAGE, IMAGE_PROMPT_DECLINED_MESSAGE } from "@/lib/image-gen/failure-copy";
import { imageChargeUsd } from "@/lib/ai-models/image-price";
import type { ImageTokenUsage } from "@/lib/image-gen/types";
import { videoSecondsUsd, videoChargeUsd } from "@/lib/ai-models/video-price";
import { voiceChangeEstimateUsd } from "@/lib/ai-models/service-price";
import { VOICE_CHANGE_PRICE_MODEL_ID } from "@/lib/ai-models/service-models";
import { DEFAULT_VOICE_CHANGE_SETTINGS } from "@/lib/elevenlabs/voice-settings";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";
import { seededPrice } from "@/lib/ai-models/test-prices";
import { voicePreviewCostUsd, voicePreviewParams } from "@/lib/avatars/voice-preview";
import { SEEDANCE_MODEL_ID } from "@/lib/video-gen/client-models";
import { AVATAR_VOICE_PREVIEW_SLOT } from "@/lib/avatars/constants";
import { VIDEO_EDIT_FAILED_MESSAGE, VIDEO_EDIT_REFUSED_MESSAGE } from "@/lib/video-edit/record";

const ORIGINAL = "https://storage.googleapis.com/b/g1-original.mp4";
const REVOICED = "https://storage.googleapis.com/b/g1-revoiced.mp4";
const VC = { baseVersionId: "v3", rootVersionId: "v2", sourceUrl: ORIGINAL, voiceId: "a1", voiceName: "Anjali", priceMultiplier: 2, settings: DEFAULT_VOICE_CHANGE_SETTINGS };
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

const voiceUsd = (seconds: number, m: number) => voiceChangeEstimateUsd(seededPrice(VOICE_CHANGE_PRICE_MODEL_ID), seconds, m)!;
const videoUsd = () => videoSecondsUsd(seededPrice(GEMINI_OMNI_MODEL_ID), 8, false, undefined)!;

describe("completeGeneration — stored video (D282)", () => {
  it("ignores a legacy meta.voice on a video generation — video cost only, no voice in params", async () => {
    await completeGeneration({
      generationId: "g1", status: "succeeded", stored: true, videoUrl: ORIGINAL, durationSeconds: 8,
      meta: { voice: voice("applied") },
    });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(videoUsd()) }));
    expect(mocks.insertVersion).toHaveBeenCalledWith(
      expect.objectContaining({ paramsUsed: expect.not.objectContaining({ voice: expect.anything() }) }),
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

describe("completeGeneration — billed from the provider's usage (D528)", () => {
  const usage = { kind: "omni", inputTokens: 5798, videoOutputTokens: 5793, textOutputTokens: 0, thoughtTokens: 334 } as const;

  it("settles at what the provider reported and records that usage on the row", async () => {
    mocks.generation = { ...mocks.generation, params_snapshot: { resolution: "360p" } };
    await completeGeneration({
      generationId: "g1", status: "succeeded", stored: true, videoUrl: ORIGINAL, durationSeconds: 3, usage,
    });
    const credits = usdToFinalCredits(videoChargeUsd(seededPrice(GEMINI_OMNI_MODEL_ID), { usage, durationSeconds: 0, audioEnabled: false, resolution: "360p" })!.usd);
    expect(credits).toBeGreaterThan(usdToFinalCredits(videoSecondsUsd(seededPrice(GEMINI_OMNI_MODEL_ID), 3, false, "360p")!));
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: credits }));
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ creditsCharged: credits, tokensUsed: usage }),
    );
  });

  it("falls back to the duration price when no usage came back", async () => {
    await completeGeneration({
      generationId: "g1", status: "succeeded", stored: true, videoUrl: ORIGINAL, durationSeconds: 8,
    });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(videoUsd()) }));
  });

  it("ignores a malformed usage and prices by duration", async () => {
    await completeGeneration({
      generationId: "g1", status: "succeeded", stored: true, videoUrl: ORIGINAL, durationSeconds: 8,
      usage: { kind: "omni", inputTokens: -5 } as never,
    });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(videoUsd()) }));
  });

  it("keeps a voice change priced by its voice, whatever usage arrives", async () => {
    mocks.generation = { ...mocks.generation, type: "voice", inputs_snapshot: { voiceChange: VC } };
    await completeGeneration({
      generationId: "g1", status: "succeeded", stored: true, videoUrl: REVOICED, durationSeconds: 8, usage,
    });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: usdToFinalCredits(voiceUsd(8, 2)) }),
    );
  });
});

describe("completeGeneration — Kling billed by its units (D535)", () => {
  const kling = (created_at: string) => {
    mocks.generation = {
      ...mocks.generation,
      model_used: "kling:kling-3-0",
      created_at,
      params_snapshot: { resolution: "720p", audio: "off" },
    };
  };
  const run = (extra: Record<string, unknown> = {}) =>
    completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: ORIGINAL, durationSeconds: 5, ...extra } as CompleteGenerationInput);

  it("charges the units Kling reported at the unit price and records them", async () => {
    kling("2026-11-24T00:00:00Z");
    await run({ usage: { kind: "kling", units: 6.4 } });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(6.4 * 0.1508) }));
    const call = (mocks.succeedGeneration.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(call.creditsCharged).toBe(usdToFinalCredits(6.4 * 0.1508));
    expect(call.costUsd as number).toBeCloseTo(0.96512, 5);
    expect(call.providerBill).toEqual({ source: "provider_charge", meters: { provider_unit: 6.4 } });
    expect(call).not.toHaveProperty("tokensUsed");
  });

  it("charges the per-second price when Kling reported nothing", async () => {
    kling("2026-11-24T00:00:00Z");
    await run();
    const expected = videoSecondsUsd(seededPrice("kling:kling-3-0", new Date("2026-11-24T00:00:00Z")), 5, false, "720p")!;
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(expected) }));
    expect((mocks.succeedGeneration.mock.calls[0] as unknown as [Record<string, unknown>])[0].providerBill).toEqual(
      expect.objectContaining({ source: "request" }),
    );
  });

  it("keeps a run that started before the unit row on the row it reserved with, never charging 0", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    kling("2026-11-22T00:00:00Z");
    await run({ usage: { kind: "kling", units: 6.4 } });
    const expected = videoSecondsUsd(seededPrice("kling:kling-3-0", new Date("2026-11-22T00:00:00Z")), 5, false, "720p")!;
    expect(expected).toBeGreaterThan(0);
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(expected) }));
    const bill = (mocks.succeedGeneration.mock.calls[0] as unknown as [Record<string, unknown>])[0].providerBill;
    expect(bill).toEqual({ source: "provider_charge", meters: { provider_unit: 6.4 }, unpriced: ["provider_unit"] });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("provider_unit"));
    spy.mockRestore();
  });

  it("writes Kling's raw blocks verbatim on the bill", async () => {
    kling("2026-11-24T00:00:00Z");
    const raw = [{ task_id: "t1", final_unit_deduction: "6.4" }];
    await run({ usage: { kind: "kling", units: 6.4, raw } });
    const bill = (mocks.succeedGeneration.mock.calls[0] as unknown as [Record<string, unknown>])[0].providerBill as { raw?: unknown };
    expect(bill.raw).toEqual(raw);
  });
});

describe("completeGeneration — a price that cannot be found (D534)", () => {
  it("settles at the reserved amount, never 0, and still succeeds", async () => {
    const { priceForGeneration } = await import("@/lib/ai-models/run-price");
    vi.mocked(priceForGeneration).mockResolvedValueOnce(null);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: ORIGINAL, durationSeconds: 8 });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: 77 }));
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ creditsCharged: 77, costUsd: undefined }));
    expect(mocks.failGeneration).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("completeGeneration — failed video edit (D483)", () => {
  const EDIT = {
    baseVersionId: "v3", rootVersionId: "v1", instruction: "make it beige", editPrompt: "make it beige",
    referenceNodeIds: [], referenceUrls: [], resolution: "720p",
  };
  beforeEach(() => {
    mocks.generation = { ...mocks.generation, inputs_snapshot: { videoEdit: EDIT } };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("stores plain words for a raw failure and still refunds", async () => {
    await completeGeneration({ generationId: "g1", status: "failed", error: "Omni edit failed (500)" });
    expect(mocks.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: VIDEO_EDIT_FAILED_MESSAGE });
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });

  it("keeps the refused message", async () => {
    await completeGeneration({ generationId: "g1", status: "failed", error: VIDEO_EDIT_REFUSED_MESSAGE });
    expect(mocks.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: VIDEO_EDIT_REFUSED_MESSAGE });
  });

  it("uses plain words when the download fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 404 }));
    await completeGeneration({ generationId: "g1", status: "succeeded", videoUrl: "https://provider.example/v.mp4", durationSeconds: 5 });
    expect(mocks.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: VIDEO_EDIT_FAILED_MESSAGE });
    expect(mocks.refundReservation).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("leaves a failed normal video row unchanged", async () => {
    mocks.generation = { ...mocks.generation, inputs_snapshot: {} };
    await completeGeneration({ generationId: "g1", status: "failed", error: "Provider said no" });
    expect(mocks.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: "Provider said no" });
  });
});

describe("completeGeneration — voice change (D284)", () => {
  it("appends a new version with the root's model/params, the voice record + drift, and charges the voice only", async () => {
    mocks.generation = { ...mocks.generation, type: "voice", params_snapshot: { durationSeconds: 8 }, inputs_snapshot: { prompt: "p", voiceChange: VC } };
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: REVOICED, durationSeconds: 8, meta: { voiceChange: { driftMs: 40 } } });
    expect(mocks.insertVersion).toHaveBeenCalledWith(expect.objectContaining({
      output: REVOICED,
      modelUsed: GEMINI_OMNI_MODEL_ID,
      paramsUsed: { durationSeconds: 8 },
      inputsUsed: { prompt: "p", voiceChange: { ...VC, driftMs: 40 } },
    }));
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(voiceUsd(8, 2)) }));
  });

  it("charges the credits ElevenLabs reported, at the credit price, and records the bill", async () => {
    mocks.generation = { ...mocks.generation, type: "voice", params_snapshot: { durationSeconds: 8 }, inputs_snapshot: { prompt: "p", voiceChange: VC } };
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: REVOICED, durationSeconds: 8, meta: { voiceChange: { driftMs: 40, characterCost: 30 } } });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(30 * 0.000182) }));
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({
      costUsd: expect.closeTo(0.00546, 8),
      providerBill: { source: "provider_charge", meters: { provider_credit: 30 } },
    }));
  });

  it("without reported credits it charges seconds x the voice's multiplier, as a request bill", async () => {
    mocks.generation = { ...mocks.generation, type: "voice", params_snapshot: { durationSeconds: 8 }, inputs_snapshot: { prompt: "p", voiceChange: VC } };
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: REVOICED, durationSeconds: 8 });
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({
      providerBill: { source: "request", meters: { audio_second: 16 } },
    }));
  });

  it("finds a recorded voice row by the ElevenLabs id, not the video's model", async () => {
    const { priceForGeneration } = await import("@/lib/ai-models/run-price");
    mocks.generation = { ...mocks.generation, model_price_id: "p-1", type: "voice", inputs_snapshot: { voiceChange: VC } };
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: REVOICED, durationSeconds: 8 });
    expect(priceForGeneration).toHaveBeenCalledWith(expect.objectContaining({ model_used: VOICE_CHANGE_PRICE_MODEL_ID, model_price_id: "p-1" }));
  });

  it("settles the reserved amount, keeping the version, when the voice change has no price row", async () => {
    const { priceForNewRun } = await import("@/lib/ai-models/run-price");
    vi.mocked(priceForNewRun).mockResolvedValueOnce(null);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.generation = { ...mocks.generation, type: "voice", inputs_snapshot: { prompt: "p", voiceChange: VC } };
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: REVOICED, durationSeconds: 8 });
    expect(mocks.insertVersion).toHaveBeenCalled();
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: 77 }));
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ creditsCharged: 77, costUsd: undefined, providerBill: null }));
    spy.mockRestore();
  });

  it("a failed voice change creates no version and refunds", async () => {
    mocks.generation = { ...mocks.generation, type: "voice", inputs_snapshot: { voiceChange: VC } };
    await completeGeneration({ generationId: "g1", status: "failed", error: "The new voice came back out of sync, so nothing was changed." });
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalled();
  });
});

describe("completeGeneration — an avatar's voice preview (D294)", () => {
  const PREVIEW = "https://storage.googleapis.com/b/clients/c1/avatars/a1/voice-preview/g1.mp4";
  beforeEach(() => {
    mocks.generation = {
      ...mocks.generation,
      node_id: null,
      avatar_id: "a1",
      client_id: "c1",
      type: "video",
      params_snapshot: voicePreviewParams("omni"),
      inputs_snapshot: { slot: AVATAR_VOICE_PREVIEW_SLOT, mode: "named", line: "Hi.", voiceId: "v1", voiceName: "Surabhi", priceMultiplier: 2, frontUrl: "f" },
    };
  });

  it("settles the clip plus the voice change and records the stored clip, with no version", async () => {
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: PREVIEW, durationSeconds: 6, meta: { voiceChange: { driftMs: 30 } } });
    const credits = usdToFinalCredits(voicePreviewCostUsd(seededPrice(GEMINI_OMNI_MODEL_ID), seededPrice(VOICE_CHANGE_PRICE_MODEL_ID), "named", "omni", 6, "720p", 2)!);
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ generationId: "g1", actualAmount: credits }));
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({
      generationId: "g1", outputSnapshot: PREVIEW, creditsCharged: credits, meta: { voiceChange: { driftMs: 30 } },
    }));
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.refundReservation).not.toHaveBeenCalled();
  });

  it("charges the voice part by the credits ElevenLabs reported", async () => {
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: PREVIEW, durationSeconds: 6, meta: { voiceChange: { driftMs: 30, characterCost: 20 } } });
    const clip = voicePreviewCostUsd(seededPrice(GEMINI_OMNI_MODEL_ID), null, "native", "omni", 6, "720p", 2)!;
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(clip + 20 * 0.000182) }));
  });

  it("settles at the reserved amount, never 0, when the clip's price cannot be found (D534)", async () => {
    const { priceForGeneration } = await import("@/lib/ai-models/run-price");
    vi.mocked(priceForGeneration).mockResolvedValueOnce(null);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: PREVIEW, durationSeconds: 6 });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: 77 }));
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ creditsCharged: 77, costUsd: undefined }));
    expect(mocks.refundReservation).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("refunds in full when the preview failed — the operator never pays for a clip they did not get", async () => {
    await completeGeneration({ generationId: "g1", status: "failed", error: "The new voice came back out of sync, so nothing was changed." });
    expect(mocks.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: "The new voice came back out of sync, so nothing was changed." });
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
    expect(mocks.settleGeneration).not.toHaveBeenCalled();
  });

  it("refuses a clip that is not in our bucket", async () => {
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: "https://evil.example/x.mp4", durationSeconds: 6 });
    expect(mocks.refundReservation).toHaveBeenCalled();
    expect(mocks.succeedGeneration).not.toHaveBeenCalled();
  });

  it("refuses a clip the task did not store", async () => {
    await completeGeneration({ generationId: "g1", status: "succeeded", videoUrl: PREVIEW, durationSeconds: 6 });
    expect(mocks.refundReservation).toHaveBeenCalled();
    expect(mocks.succeedGeneration).not.toHaveBeenCalled();
  });

  it("drops a preview whose client is no longer in the org that paid", async () => {
    mocks.getClientById.mockResolvedValueOnce({ id: "c1", org_id: "org-2" });
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: PREVIEW, durationSeconds: 6 });
    expect(mocks.refundReservation).toHaveBeenCalled();
    expect(mocks.succeedGeneration).not.toHaveBeenCalled();
  });

  it("still drops any other avatar-owned generation — images never come through the webhook", async () => {
    mocks.generation = { ...mocks.generation, type: "image", inputs_snapshot: { slot: "front" } };
    await completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: PREVIEW, durationSeconds: 6 });
    expect(mocks.failGeneration).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/no node/) }));
    expect(mocks.succeedGeneration).not.toHaveBeenCalled();
  });
});

describe("completeGeneration — a native voice preview keeps its voice (D296)", () => {
  const CLIP = "https://storage.googleapis.com/b/clients/c1/avatars/a1/voice-preview/g1.mp4";
  const SAMPLE = "https://storage.googleapis.com/b/clients/c1/avatars/a1/voice-sample/g1.mp3";
  beforeEach(() => {
    mocks.generation = {
      ...mocks.generation,
      node_id: null,
      avatar_id: "a1",
      client_id: "c1",
      type: "video",
      model_used: SEEDANCE_MODEL_ID,
      params_snapshot: voicePreviewParams("seedance"),
      inputs_snapshot: { slot: AVATAR_VOICE_PREVIEW_SLOT, mode: "native", line: "Hi.", frontUrl: "f" },
    };
  });

  const succeed = (meta?: Record<string, unknown>) =>
    completeGeneration({ generationId: "g1", status: "succeeded", stored: true, videoUrl: CLIP, durationSeconds: 5, meta });

  it("settles the Seedance clip alone and records the extracted voice on the avatar", async () => {
    await succeed({ voiceSample: { url: SAMPLE, durationSeconds: 4.8 } });
    const credits = usdToFinalCredits(voicePreviewCostUsd(seededPrice(SEEDANCE_MODEL_ID), null, "native", "seedance", 5, "480p", 1)!);
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ generationId: "g1", actualAmount: credits }));
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ outputSnapshot: CLIP, creditsCharged: credits }));
    expect(mocks.updateAvatar).toHaveBeenCalledWith("c1", "a1", {
      voiceSample: { url: SAMPLE, durationSeconds: 4.8, sourceKey: "g1" },
    });
    expect(mocks.insertVersion).not.toHaveBeenCalled();
  });

  it("keeps the voice as an auto voice before marking the preview succeeded (D301)", async () => {
    await succeed({ voiceSample: { url: SAMPLE, durationSeconds: 4.8 } });
    expect(mocks.keepAutoVoice).toHaveBeenCalledWith(expect.objectContaining({
      clientId: "c1", avatarId: "a1", sample: { url: SAMPLE, durationSeconds: 4.8, sourceKey: "g1" },
    }));
    expect(mocks.keepAutoVoice.mock.invocationCallOrder[0]).toBeLessThan(mocks.succeedGeneration.mock.invocationCallOrder[0]);
  });

  it("does not price the voice change into a native preview — Seedance's voice arrives with the clip", async () => {
    mocks.generation = { ...mocks.generation, inputs_snapshot: { ...(mocks.generation.inputs_snapshot as object), priceMultiplier: 3 } };
    await succeed({ voiceSample: { url: SAMPLE, durationSeconds: 4.8 } });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: usdToFinalCredits(voicePreviewCostUsd(seededPrice(SEEDANCE_MODEL_ID), null, "native", "seedance", 5, "480p", 1)!) }),
    );
  });

  it("ignores a sample URL outside our bucket rather than recording it", async () => {
    await succeed({ voiceSample: { url: "https://evil.example/x.mp3", durationSeconds: 4.8 } });
    expect(mocks.updateAvatar).not.toHaveBeenCalled();
    expect(mocks.succeedGeneration).toHaveBeenCalled();
  });

  it("still settles the clip when the reference cannot be written — the clip is paid for and playable", async () => {
    mocks.updateAvatar.mockRejectedValueOnce(new Error("row is gone"));
    await succeed({ voiceSample: { url: SAMPLE, durationSeconds: 4.8 } });
    expect(mocks.succeedGeneration).toHaveBeenCalled();
    expect(mocks.refundReservation).not.toHaveBeenCalled();
  });

  it("a failed native preview records no reference and refunds", async () => {
    await completeGeneration({ generationId: "g1", status: "failed", error: "That clip has no audio track." });
    expect(mocks.updateAvatar).not.toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
    expect(mocks.settleGeneration).not.toHaveBeenCalled();
  });

  it("records nothing for a named preview, even if one reported a sample", async () => {
    mocks.generation = {
      ...mocks.generation,
      inputs_snapshot: { slot: AVATAR_VOICE_PREVIEW_SLOT, mode: "named", line: "Hi.", voiceId: "v1", frontUrl: "f" },
    };
    await succeed({ voiceSample: { url: SAMPLE, durationSeconds: 4.8 } });
    expect(mocks.updateAvatar).not.toHaveBeenCalled();
  });
});

describe("completeGeneration — image (D366)", () => {
  beforeEach(() => {
    mocks.generation = {
      id: "g1",
      status: "running",
      type: "image",
      node_id: "n1",
      org_id: "org-1",
      user_id: "u1",
      model_used: "openai:gpt-image-2",
      params_snapshot: { quality: "high" },
      inputs_snapshot: { promptNodeId: "p1" },
    };
  });

  const TOKENS: ImageTokenUsage = {
    text_input_tokens: 10,
    image_input_tokens: 0,
    image_output_tokens: 20,
    total_tokens: 30,
  };

  const succeeded = {
    generationId: "g1",
    status: "succeeded" as const,
    kind: "image" as const,
    imageUrl: "https://storage.googleapis.com/b/g1.png",
    mimeType: "image/png",
    width: 1024,
    height: 1536,
    fileSizeBytes: 2048,
    tokensUsed: TOKENS,
  };

  it("creates the version from the run's snapshots, makes it active and settles at the price of its tokens", async () => {
    await completeGeneration(succeeded);
    const usd = (10 * 5 + 20 * 30) / 1e6;
    expect(mocks.insertVersion).toHaveBeenCalledWith({
      nodeId: "n1",
      operatorUserId: "u1",
      inputsUsed: { promptNodeId: "p1" },
      paramsUsed: {
        modelId: "openai:gpt-image-2",
        quality: "high",
        tokensUsed: TOKENS,
        imageWidth: 1024,
        imageHeight: 1536,
        fileSizeBytes: 2048,
      },
      modelUsed: "openai:gpt-image-2",
      output: "https://storage.googleapis.com/b/g1.png",
    });
    expect(mocks.setActiveVersion).toHaveBeenCalledWith("n1", "ver-1");
    expect(mocks.settleGeneration).toHaveBeenCalledWith({
      orgId: "org-1",
      generationId: "g1",
      actualAmount: usdToFinalCredits(usd),
    });
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: "g1",
        versionId: "ver-1",
        costUsd: expect.closeTo(usd, 10),
        outputSnapshot: "https://storage.googleapis.com/b/g1.png",
      }),
    );
  });

  it("refuses an image stored outside this app's bucket", async () => {
    await completeGeneration({ ...succeeded, imageUrl: "https://evil.example/x.png" });
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
    expect(mocks.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: IMAGE_GENERATION_FAILED_MESSAGE });
    expect(mocks.settleGeneration).not.toHaveBeenCalled();
  });

  it("bills a token-billed image from its reported tokens, never at zero", async () => {
    const tokenBilled = succeeded;
    const tokens: ImageTokenUsage = {
      text_input_tokens: 200,
      image_input_tokens: 1000,
      image_output_tokens: 4000,
      total_tokens: 5200,
    };
    await completeGeneration({ ...tokenBilled, tokensUsed: tokens });
    const usd = imageChargeUsd(seededPrice("openai:gpt-image-2"), { tokens, billedImages: null })!.usd;
    const credits = usdToFinalCredits(usd);
    expect(credits).toBeGreaterThan(0);
    expect(mocks.settleGeneration).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1", actualAmount: credits });
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ costUsd: usd, creditsCharged: credits }));
  });

  it("prices the images Seedream billed with its row (D534)", async () => {
    mocks.generation = { ...mocks.generation, model_used: "seedream:seedream-5-0-pro", params_snapshot: { image_size: "2K" } };
    await completeGeneration({ ...succeeded, tokensUsed: null, billedImages: { output_image: 1, input_image: 2, size: "2K" } });
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(0.096) }));
  });

  it("settles a finished image at its reserved amount when its price is missing (D534)", async () => {
    const { priceForGeneration } = await import("@/lib/ai-models/run-price");
    vi.mocked(priceForGeneration).mockResolvedValueOnce(null);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await completeGeneration(succeeded);
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: 77 }));
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ creditsCharged: 77, costUsd: undefined }));
    expect(mocks.setActiveVersion).toHaveBeenCalled();
    expect(mocks.failGeneration).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("settles at the reserved amount, never 0, when the provider billed meters with no price line", async () => {
    const { priceForGeneration } = await import("@/lib/ai-models/run-price");
    vi.mocked(priceForGeneration).mockResolvedValueOnce({ ...seededPrice("openai:gpt-image-2"), lines: [] });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await completeGeneration(succeeded);
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: 77 }));
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ creditsCharged: 77, costUsd: undefined }));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("meters with no price"));
    const bill = (mocks.succeedGeneration.mock.calls[0] as unknown as [Record<string, unknown>])[0].providerBill as { source: string };
    expect(bill.source).toBe("provider_usage");
    spy.mockRestore();
  });

  it("fails closed when an image result arrives for a non-image generation", async () => {
    mocks.generation = { ...mocks.generation, type: "video" };
    await completeGeneration(succeeded);
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.settleGeneration).not.toHaveBeenCalled();
    expect(mocks.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: "Image result for a non-image generation" });
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });

  it("records a failed image as a failed version in plain words, then fails and refunds", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const raw = "Image generated but the webhook rejected it (500) — imageUrl=https://storage.googleapis.com/b/g1.png";
    await completeGeneration({ generationId: "g1", status: "failed", error: raw });
    expect(mocks.insertVersion).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "n1", operatorUserId: "u1", error: IMAGE_GENERATION_FAILED_MESSAGE }),
    );
    expect(mocks.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: IMAGE_GENERATION_FAILED_MESSAGE });
    expect(mocks.refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
    // The raw reason, with the paid image's URL, is kept for the operator in the server log.
    expect(log).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ generationId: "g1", error: raw }));
    log.mockRestore();
  });

  it("tells the user plainly when the model declined the prompt", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await completeGeneration({ generationId: "g1", status: "failed", error: "400 rejected by our safety system" });
    expect(mocks.failGeneration).toHaveBeenCalledWith({ generationId: "g1", error: IMAGE_PROMPT_DECLINED_MESSAGE });
    log.mockRestore();
  });

  it("logs a paid image that arrives after its run already ended, so it can be recovered", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.generation = { ...mocks.generation, status: "failed" };
    await completeGeneration(succeeded);
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ generationId: "g1", imageUrl: "https://storage.googleapis.com/b/g1.png" }),
    );
    log.mockRestore();
  });

  it("settles before the image becomes active, so a failed settlement leaves no active image", async () => {
    mocks.settleGeneration.mockRejectedValueOnce(new Error("db down"));
    await expect(completeGeneration(succeeded)).rejects.toThrow("db down");
    expect(mocks.setActiveVersion).not.toHaveBeenCalled();
    expect(mocks.succeedGeneration).not.toHaveBeenCalled();
  });

  it("ignores a duplicate delivery", async () => {
    mocks.generation = { ...mocks.generation, status: "succeeded" };
    await completeGeneration(succeeded);
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.settleGeneration).not.toHaveBeenCalled();
  });
});

describe("isVideoSucceeded", () => {
  const base = { generationId: "g", status: "succeeded" as const, durationSeconds: 5 };
  it("accepts a plain or explicit video and rejects dub, lip sync, image and failure", () => {
    expect(isVideoSucceeded({ ...base, videoUrl: "u" })).toBe(true);
    expect(isVideoSucceeded({ ...base, kind: "video", videoUrl: "u" })).toBe(true);
    expect(isVideoSucceeded({ ...base, kind: "lipsync", stored: true, videoUrl: "u", vendorRequestId: "r" })).toBe(false);
    expect(isVideoSucceeded({ ...base, kind: "dub", stored: true, dubbedUrl: "u", dubbedAudioUrl: "a", vendorJobId: "j" })).toBe(false);
    expect(isVideoSucceeded({ generationId: "g", status: "failed", error: "x" } as CompleteGenerationInput)).toBe(false);
  });
});
