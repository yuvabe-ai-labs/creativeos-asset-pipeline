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
  getClientById: vi.fn(async (): Promise<{ id: string; org_id: string } | null> => ({ id: "c1", org_id: "org-1" })),
  updateAvatar: vi.fn(async () => null),
  keepAutoVoice: vi.fn(async (): Promise<string | null> => "auto1"),
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

import { completeGeneration } from "./complete";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { computeVoiceChangeCost } from "@/lib/elevenlabs/cost";
import { DEFAULT_VOICE_CHANGE_SETTINGS } from "@/lib/elevenlabs/voice-settings";
import { usdToFinalCredits } from "@/lib/credits/units";
import { GEMINI_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";
import { voicePreviewCostUsd, voicePreviewParams } from "@/lib/avatars/voice-preview";
import { SEEDANCE_MODEL_ID } from "@/lib/video-gen/client-models";
import { AVATAR_VOICE_PREVIEW_SLOT } from "@/lib/avatars/constants";

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

const videoUsd = () => computeVideoCost(GEMINI_OMNI_MODEL_ID, 8, false, undefined)!.usd;

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
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ actualAmount: usdToFinalCredits(computeVoiceChangeCost(8, 2).usd) }));
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
    const credits = usdToFinalCredits(voicePreviewCostUsd("named", "omni", 6, "720p", 2)!);
    expect(mocks.settleGeneration).toHaveBeenCalledWith(expect.objectContaining({ generationId: "g1", actualAmount: credits }));
    expect(mocks.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({
      generationId: "g1", outputSnapshot: PREVIEW, creditsCharged: credits, meta: { voiceChange: { driftMs: 30 } },
    }));
    expect(mocks.insertVersion).not.toHaveBeenCalled();
    expect(mocks.refundReservation).not.toHaveBeenCalled();
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
    const credits = usdToFinalCredits(voicePreviewCostUsd("native", "seedance", 5, "480p", 1)!);
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
      expect.objectContaining({ actualAmount: usdToFinalCredits(voicePreviewCostUsd("native", "seedance", 5, "480p", 1)!) }),
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
