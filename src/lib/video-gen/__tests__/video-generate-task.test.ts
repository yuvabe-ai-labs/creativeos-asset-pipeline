import { describe, it, expect, vi, beforeEach } from "vitest";

// D541 — trigger/video-generate.ts dispatches through the adapter map, with the model's row read
// from the catalog at run time. A missing row or adapter is reported as final (one attempt).
const m = vi.hoisted(() => ({
  getAiCatalog: vi.fn(),
  adapter: vi.fn(async () => ({ videoUrl: "https://x/v.mp4", durationSeconds: 8 })),
  postGenerationWebhook: vi.fn(async () => new Response("{}")),
  postGenerationWebhookSafely: vi.fn(async () => undefined),
  waitFor: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk/v3", () => ({
  task: (config: unknown) => config,
  logger: { info: vi.fn(), error: vi.fn() },
  wait: { for: m.waitFor },
  AbortTaskRunError: class AbortTaskRunError extends Error {},
}));
vi.mock("@/lib/ai-models/catalog", () => ({ getAiCatalog: m.getAiCatalog }));
vi.mock("@/lib/video-gen/adapters", async () => {
  const { stubAdapters } = await import("@/lib/ai-models/test-catalog");
  return { videoAdapters: stubAdapters("video", m.adapter) };
});
// Nothing reaches a real provider, whichever way the task dispatches.
vi.mock("@/lib/video-gen/registry", () => ({ videoGenRegistry: {} }));
vi.mock("@/lib/generations/post-webhook", () => ({
  assertWebhookConfig: () => ({ url: "https://app/api/webhooks/generation", secret: "s" }),
  postGenerationWebhook: m.postGenerationWebhook,
  postGenerationWebhookSafely: m.postGenerationWebhookSafely,
}));

import { videoGenerateTask } from "../../../../trigger/video-generate";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";

type Payload = { generationId: string; modelId: string; prompt: string; referenceUrls: string[]; params: Record<string, unknown>; mockMode?: boolean };
const run = (videoGenerateTask as unknown as {
  run: (p: Payload, o: { ctx: { attempt: { number: number } } }) => Promise<void>;
}).run;
const payload = (modelId: string, extra: Partial<Payload> = {}): Payload => ({
  generationId: "gen1", modelId, prompt: "A cab door opens", referenceUrls: [], params: {}, ...extra,
});
const ctx = { ctx: { attempt: { number: 1 } } };

beforeEach(() => {
  vi.clearAllMocks();
  m.getAiCatalog.mockImplementation(async () => seededModelCatalog());
});

describe("video-generate task (D541)", () => {
  it("generates through the catalog row's adapter, reading the catalog once", async () => {
    await run(payload("kling:kling-3-0"), ctx);
    expect(m.getAiCatalog).toHaveBeenCalledTimes(1);
    expect(m.adapter).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "A cab door opens", referenceUrls: [] }),
      expect.objectContaining({ providerModelId: "kling-3.0" }),
    );
    expect(m.postGenerationWebhook).toHaveBeenCalledWith(expect.objectContaining({ status: "succeeded", videoUrl: "https://x/v.mp4" }));
  });

  it("reports a missing row or adapter as final on attempt 1, which refunds", async () => {
    await expect(run(payload("veo:veo-3.1"), ctx)).rejects.toThrow("This model isn't available. Pick another.");
    expect(m.adapter).not.toHaveBeenCalled();
    expect(m.postGenerationWebhookSafely).toHaveBeenCalledWith(
      { generationId: "gen1", status: "failed", error: "This model isn't available. Pick another." },
      "failure report",
    );
  });

  it("reports a failed catalog read as final too (one attempt), before any provider call", async () => {
    m.getAiCatalog.mockRejectedValueOnce(new Error("db down"));
    await expect(run(payload("kling:kling-3-0"), ctx)).rejects.toThrow("db down");
    expect(m.adapter).not.toHaveBeenCalled();
    expect(m.postGenerationWebhookSafely).toHaveBeenCalledWith(
      { generationId: "gen1", status: "failed", error: "db down" }, "failure report",
    );
  });

  it("mock mode never reads the catalog", async () => {
    await run(payload("kling:kling-3-0", { mockMode: true }), ctx);
    expect(m.getAiCatalog).not.toHaveBeenCalled();
    expect(m.adapter).not.toHaveBeenCalled();
    expect(m.postGenerationWebhook).toHaveBeenCalledWith(expect.objectContaining({ status: "succeeded" }));
  });
});
