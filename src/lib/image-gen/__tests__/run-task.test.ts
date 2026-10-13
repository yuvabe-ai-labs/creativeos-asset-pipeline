import { describe, it, expect, vi } from "vitest";
import { runImageGenerateTask, type ImageGenerateTaskDeps } from "../run-task";
import type { ImageGenerateTaskPayload } from "../task-payload";
import type { ImageGenResult, ImageTokenUsage } from "../types";
import { PaidResultError } from "@/lib/generations/task-failure";
import { IMAGE_PROVIDER_TIMEOUT_MS } from "../constants";

const payload: ImageGenerateTaskPayload = {
  generationId: "g1",
  modelId: "openai:gpt-image-2",
  prompt: "A mug on a desk",
  referenceUrls: ["https://cdn/ref.png"],
  params: { quality: "high" },
  uploads: {
    "image/png": { putUrl: "https://put/png", url: "https://storage.googleapis.com/b/g1.png" },
    "image/jpeg": { putUrl: "https://put/jpg", url: "https://storage.googleapis.com/b/g1.jpg" },
    "image/webp": { putUrl: "https://put/webp", url: "https://storage.googleapis.com/b/g1.webp" },
  },
};

const TOKENS: ImageTokenUsage = {
  text_input_tokens: 10,
  image_input_tokens: 0,
  image_output_tokens: 20,
  total_tokens: 30,
};

function deps(overrides: Partial<ImageGenerateTaskDeps> = {}): ImageGenerateTaskDeps {
  return {
    generate: vi.fn(async (): Promise<ImageGenResult> => ({
      imageBase64: Buffer.from("png-bytes").toString("base64"),
      mimeType: "image/png",
      tokensUsed: TOKENS,
    })),
    fetchFn: vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch,
    readSize: vi.fn(async () => ({ width: 1024, height: 1536 })),
    postWebhook: vi.fn(async () => new Response(null, { status: 200 })),
    ...overrides,
  };
}

describe("runImageGenerateTask (D366)", () => {
  it("generates, uploads to the signed URL for the result's type, and reports the stored image", async () => {
    const d = deps();
    await runImageGenerateTask(payload, d);
    expect(d.generate).toHaveBeenCalledWith({
      prompt: "A mug on a desk",
      referenceUrls: ["https://cdn/ref.png"],
      params: { quality: "high" },
      // The task's own retry is the only one: the provider's client must not stack its own on it.
      providerMaxRetries: 0,
    });
    expect(d.fetchFn).toHaveBeenCalledWith(
      "https://put/png",
      expect.objectContaining({ method: "PUT", headers: { "Content-Type": "image/png" } }),
    );
    expect(d.postWebhook).toHaveBeenCalledWith({
      generationId: "g1",
      status: "succeeded",
      kind: "image",
      imageUrl: "https://storage.googleapis.com/b/g1.png",
      mimeType: "image/png",
      width: 1024,
      height: 1536,
      fileSizeBytes: Buffer.from("png-bytes").length,
      tokensUsed: TOKENS,
    });
  });

  it("downloads the mask and passes it to the provider as base64", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url === "https://storage.googleapis.com/b/g1-mask.png"
        ? new Response(Buffer.from("mask-bytes"))
        : new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;
    const d = deps({ fetchFn });
    await runImageGenerateTask({ ...payload, maskUrl: "https://storage.googleapis.com/b/g1-mask.png", maskMime: "image/png" }, d);
    expect(d.generate).toHaveBeenCalledWith(
      expect.objectContaining({ maskBase64: Buffer.from("mask-bytes").toString("base64"), maskMime: "image/png" }),
    );
  });

  it("refuses a result type it has no signed upload for — a paid result, so never retried", async () => {
    const d = deps({
      generate: vi.fn(async (): Promise<ImageGenResult> => ({ imageBase64: "AA", mimeType: "image/gif", tokensUsed: TOKENS })),
    });
    const run = runImageGenerateTask(payload, d);
    await expect(run).rejects.toBeInstanceOf(PaidResultError);
    await expect(run).rejects.toThrow(/image\/gif/);
    expect(d.postWebhook).not.toHaveBeenCalled();
  });

  it("fails as a paid result, naming the stored image, when the webhook rejects it", async () => {
    const d = deps({ postWebhook: vi.fn(async () => new Response("no", { status: 500 })) });
    const run = runImageGenerateTask(payload, d);
    await expect(run).rejects.toBeInstanceOf(PaidResultError);
    await expect(run).rejects.toThrow(/https:\/\/storage\.googleapis\.com\/b\/g1\.png/);
  });

  it("fails as a paid result, without reporting success, when the upload fails", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 403 })) as unknown as typeof fetch;
    const d = deps({ fetchFn });
    const run = runImageGenerateTask(payload, d);
    await expect(run).rejects.toBeInstanceOf(PaidResultError);
    await expect(run).rejects.toThrow(/upload failed: 403/i);
    expect(d.postWebhook).not.toHaveBeenCalled();
  });

  it("leaves a provider error retryable — nothing has been paid for", async () => {
    const d = deps({
      generate: vi.fn(async () => {
        throw new Error("provider 500");
      }) as unknown as ImageGenerateTaskDeps["generate"],
    });
    const run = runImageGenerateTask(payload, d);
    await expect(run).rejects.toThrow("provider 500");
    await expect(run).rejects.not.toBeInstanceOf(PaidResultError);
  });

  it("gives up on a provider call that hangs, inside the task's time limit, as an ordinary failure", async () => {
    const d = deps({
      generate: vi.fn(() => new Promise<ImageGenResult>(() => undefined)),
      providerTimeoutMs: 20,
    });
    const run = runImageGenerateTask(payload, d);
    await expect(run).rejects.toThrow(/did not answer/);
    await expect(run).rejects.not.toBeInstanceOf(PaidResultError);
    expect(d.postWebhook).not.toHaveBeenCalled();
  });

  it("keeps the provider call's limit below the task's 600s maxDuration", () => {
    expect(IMAGE_PROVIDER_TIMEOUT_MS).toBeLessThan(600 * 1000);
  });
});
