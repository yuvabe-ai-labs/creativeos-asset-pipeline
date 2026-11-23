import { describe, it, expect, vi, beforeEach } from "vitest";

// D541 — trigger/avatar-voice-preview.ts generates its clip through the adapter map, with the
// engine's row read from the catalog at run time. A missing row or adapter reports the failure
// (which refunds) and does not retry.
const m = vi.hoisted(() => ({
  getAiCatalog: vi.fn(),
  adapter: vi.fn(async () => ({ videoUrl: "https://x/v.mp4", durationSeconds: 8 })),
  runVoicePreview: vi.fn(),
  runNativeVoicePreview: vi.fn(),
  postGenerationWebhook: vi.fn(async () => new Response("{}")),
  postGenerationWebhookSafely: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk/v3", () => ({
  task: (config: unknown) => config,
  logger: { info: vi.fn(), error: vi.fn() },
  AbortTaskRunError: class AbortTaskRunError extends Error {},
}));
vi.mock("@/lib/ai-models/catalog", () => ({ getAiCatalog: m.getAiCatalog }));
vi.mock("@/lib/video-gen/adapters", async () => {
  const { stubAdapters } = await import("@/lib/ai-models/test-catalog");
  return { videoAdapters: stubAdapters("video", m.adapter) };
});
// Nothing reaches a real provider, whichever way the task dispatches.
vi.mock("@/lib/video-gen/registry", () => ({ videoGenRegistry: {} }));
vi.mock("@/lib/avatars/voice-preview-run", () => ({
  runVoicePreview: m.runVoicePreview,
  runNativeVoicePreview: m.runNativeVoicePreview,
}));
vi.mock("@/lib/voice-change/http", () => ({ fetchBytes: vi.fn(), putBytes: vi.fn() }));
vi.mock("@/lib/media/ffmpeg", () => ({
  extractAudio: vi.fn(), extractVoiceReference: vi.fn(), replaceAudio: vi.fn(), probeDurationSeconds: vi.fn(),
}));
vi.mock("@/lib/elevenlabs/client", () => ({ speechToSpeech: vi.fn() }));
vi.mock("@/lib/video-gen/download-headers", () => ({ videoDownloadHeaders: () => ({}) }));
vi.mock("@/lib/generations/post-webhook", () => ({
  assertWebhookConfig: () => ({ url: "https://app/api/webhooks/generation", secret: "s" }),
  postGenerationWebhook: m.postGenerationWebhook,
  postGenerationWebhookSafely: m.postGenerationWebhookSafely,
}));

import { AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { avatarVoicePreviewTask } from "../../../../trigger/avatar-voice-preview";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { VOICE_PREVIEW_ENGINE } from "../voice-preview";
import type { AvatarVoicePreviewTaskPayload } from "../voice-preview-run";

const run = (avatarVoicePreviewTask as unknown as { run: (p: AvatarVoicePreviewTaskPayload) => Promise<void> }).run;
const NAMED = {
  mode: "named", generationId: "gen1", frontUrl: "https://s/front.png", prompt: "Hello", params: {},
  clipPutUrl: "https://s/put", revoicedUrl: "https://s/revoiced.mp4",
} as unknown as AvatarVoicePreviewTaskPayload;
const OMNI = VOICE_PREVIEW_ENGINE.omni.modelId;

beforeEach(() => {
  vi.clearAllMocks();
  m.getAiCatalog.mockImplementation(async () => seededModelCatalog());
  m.runVoicePreview.mockImplementation(async (_p: unknown, deps: { generateClip: (i: unknown) => Promise<unknown> }) => {
    await deps.generateClip({ prompt: "Hello", startFrameUrl: "https://s/front.png", params: {} });
    return { durationSeconds: 8, driftMs: 0, characterCost: 1 };
  });
});

describe("avatar-voice-preview task (D541)", () => {
  it("generates the clip through the engine row's adapter, reading the catalog once", async () => {
    await run(NAMED);
    expect(m.getAiCatalog).toHaveBeenCalledTimes(1);
    const omni = seededModelCatalog().models.find((x) => x.id === OMNI);
    expect(m.adapter).toHaveBeenCalledWith(
      { prompt: "Hello", startFrameUrl: "https://s/front.png", params: {}, referenceUrls: [] },
      expect.objectContaining({ providerModelId: omni?.providerModelId }),
    );
    expect(m.postGenerationWebhook).toHaveBeenCalledWith(expect.objectContaining({ status: "succeeded" }));
  });

  it("reports a missing row as failed (which refunds) and does not retry", async () => {
    m.getAiCatalog.mockImplementation(async () => ({
      ...seededModelCatalog(), models: seededModelCatalog().models.filter((x) => x.id !== OMNI),
    }));
    const err = await run(NAMED).catch((e) => e);
    expect(err).toBeInstanceOf(AbortTaskRunError);
    expect(m.runVoicePreview).not.toHaveBeenCalled();
    expect(m.postGenerationWebhookSafely).toHaveBeenCalledWith(
      { generationId: "gen1", status: "failed", error: "This model isn't available. Pick another." },
      "voice preview failure",
    );
  });

  it("runs the engine even if its row was hidden since the route reserved the run", async () => {
    m.getAiCatalog.mockImplementation(async () => withModel(seededModelCatalog(), OMNI, { status: "hidden" }));
    await run(NAMED);
    expect(m.adapter).toHaveBeenCalledTimes(1);
  });
});
