import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AiCatalog } from "@/lib/ai-models/types";

// D564 — trigger/image-generate.ts dispatches through the adapter map, with the model's row read
// from the catalog at run time. A missing row or adapter fails for good, before any provider call.
const m = vi.hoisted(() => ({
  catalog: null as AiCatalog | null,
  getAiCatalog: vi.fn(),
  adapter: vi.fn(async () => ({ imageBase64: "", mimeType: "image/png" })),
  runImageGenerateTask: vi.fn(),
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
vi.mock("@/lib/image-gen/adapters", async () => {
  const { stubAdapters } = await import("@/lib/ai-models/test-catalog");
  return { imageAdapters: stubAdapters("image", m.adapter) };
});
vi.mock("@/lib/image-gen/run-task", () => ({ runImageGenerateTask: m.runImageGenerateTask }));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("@/lib/generations/post-webhook", () => ({
  assertWebhookConfig: () => ({ url: "https://app/api/webhooks/generation", secret: "s" }),
  postGenerationWebhook: m.postGenerationWebhook,
  postGenerationWebhookSafely: m.postGenerationWebhookSafely,
}));

import { AbortTaskRunError } from "@trigger.dev/sdk/v3";
import { imageGenerateTask } from "../../../../trigger/image-generate";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import type { ImageGenerateTaskPayload } from "../task-payload";

type Task = {
  run: (p: ImageGenerateTaskPayload, o: { ctx: { attempt: { number: number } } }) => Promise<void>;
  onFailure: (a: { payload: ImageGenerateTaskPayload; error: unknown }) => Promise<void>;
};
const t = imageGenerateTask as unknown as Task;
const upload = { putUrl: "https://s/put", url: "https://s/img" };
const payload = (modelId: string): ImageGenerateTaskPayload => ({
  generationId: "gen1", modelId, prompt: "A mug", referenceUrls: [], params: {},
  uploads: { "image/png": upload, "image/jpeg": upload, "image/webp": upload },
});
const ctx = { ctx: { attempt: { number: 1 } } };

beforeEach(() => {
  vi.clearAllMocks();
  m.getAiCatalog.mockImplementation(async () => m.catalog ?? seededModelCatalog());
  m.catalog = null;
  m.runImageGenerateTask.mockImplementation(async (p: ImageGenerateTaskPayload, deps: { generate: (i: unknown) => Promise<unknown> }) => {
    await deps.generate({ prompt: p.prompt, referenceUrls: p.referenceUrls, params: p.params });
  });
});

describe("image-generate task (D564)", () => {
  it("generates through the catalog row's adapter, reading the catalog once", async () => {
    await t.run(payload("openai:gpt-image-2"), ctx);
    expect(m.getAiCatalog).toHaveBeenCalledTimes(1);
    expect(m.adapter).toHaveBeenCalledWith(
      { prompt: "A mug", referenceUrls: [], params: {} },
      expect.objectContaining({ providerModelId: "gpt-image-2" }),
    );
  });

  it("runs a model hidden since the route accepted it (the status is not checked again)", async () => {
    const { withModel } = await import("@/lib/ai-models/test-catalog");
    m.catalog = withModel(seededModelCatalog(), "openai:gpt-image-2", { status: "hidden" });
    await t.run(payload("openai:gpt-image-2"), ctx);
    expect(m.adapter).toHaveBeenCalledTimes(1);
  });

  it("fails for good on attempt 1 when the row or adapter is missing, and onFailure refunds", async () => {
    const err = await t.run(payload("openai:gpt-image-1"), ctx).catch((e) => e);
    expect(err).toBeInstanceOf(AbortTaskRunError);
    expect(err.message).toBe("This model isn't available. Pick another.");
    expect(m.runImageGenerateTask).not.toHaveBeenCalled();
    await t.onFailure({ payload: payload("openai:gpt-image-1"), error: err });
    expect(m.postGenerationWebhookSafely).toHaveBeenCalledWith(
      { generationId: "gen1", status: "failed", error: "This model isn't available. Pick another." },
      "failure report",
    );
  });

  it("leaves a failed catalog read retryable: nothing has been paid yet", async () => {
    m.getAiCatalog.mockRejectedValueOnce(new Error("db down"));
    const err = await t.run(payload("openai:gpt-image-2"), ctx).catch((e) => e);
    expect(err).not.toBeInstanceOf(AbortTaskRunError);
    expect(err.message).toBe("db down");
    expect(m.adapter).not.toHaveBeenCalled();
  });
});
